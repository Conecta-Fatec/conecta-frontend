/* =========================================================
   Feed: posts gerais, posts de amigos e interação principal
   - Otimizado para não gerar estrangulamento de requisições
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const postsContainer = document.getElementById('posts-container');
  const generalTab = document.getElementById('general-tab');
  const friendsTab = document.getElementById('friends-tab');
  const publishBtn = document.getElementById('publishBtn');
  const postInput = document.getElementById('postContent');
  const inlineComposer = document.getElementById('feed-create-post-card');
  const highlightedPostId = new URLSearchParams(window.location.search).get('post');

  let currentUser = getLoggedUserFromStorage();
  let currentMode = 'general';
  let cachedFriends = { ids: new Set(), nicknames: new Set() };

  try {
    currentUser = await loadLoggedUser() || currentUser;
    ConectaPosts.currentUserNickname = currentUser?.nickname || '';
  } catch (error) {
    console.error(error);
  }

  function setActiveTab(mode) {
    currentMode = mode;
    generalTab?.classList.toggle('active', mode === 'general');
    friendsTab?.classList.toggle('active', mode === 'friends');
  }

  function normalizePostsPayload(data) {
    return normalizeArray(data, 'posts', 'results', 'feed', 'items');
  }

  function isCommunityPost(post = {}) {
    return Boolean(post.community || post.community_data || post.community_slug || post.community_name);
  }

  // Cache da lista de amigos para filtrar os posts rapidamente
  async function loadFriendsIndex() {
    if (cachedFriends.ids?.size || cachedFriends.nicknames?.size) return cachedFriends;
    try {
      const data = await apiJSON('/api/users/friends/');
      const friends = normalizeArray(data, 'friends', 'results');
      cachedFriends = {
        ids: new Set(friends.map((friend) => Number(friend.id)).filter(Number.isFinite)),
        nicknames: new Set(friends.map((friend) => friend.nickname).filter(Boolean)),
      };
    } catch (error) {
      console.error('Erro ao carregar amigos para filtrar o feed:', error);
      cachedFriends = { ids: new Set(), nicknames: new Set() };
    }
    return cachedFriends;
  }

  function isPostFromFriend(post = {}, friendsIndex = { ids: new Set(), nicknames: new Set() }) {
    const author = post.author || {};
    const authorId = Number(author.id ?? post.author_id);
    const authorNickname = author.nickname || post.author_nickname || post.nickname;

    return (Number.isFinite(authorId) && friendsIndex.ids.has(authorId))
      || (authorNickname && friendsIndex.nicknames.has(authorNickname));
  }

  // OTIMIZAÇÃO: Busca o feed de amigos. Se der 404, faz um fallback 
  // usando Promise.all para carregar TUDO ao mesmo tempo sem lentidão.
  async function fetchFriendsPostsWithFallback() {
    try {
      const data = await apiJSON('/api/posts/feed/friends/');
      return normalizePostsPayload(data).filter((post) => !isCommunityPost(post));
    } catch (error) {
      if (!error.response || ![404, 405].includes(error.response.status)) {
        console.error('Erro ao buscar feed de amigos no backend:', error);
      }

      // Executa as duas requisições simultaneamente
      const [allPosts, friendsIndex] = await Promise.all([
        apiJSON('/api/posts/feed/').then(normalizePostsPayload),
        loadFriendsIndex(),
      ]);

      return allPosts.filter((post) => !isCommunityPost(post) && isPostFromFriend(post, friendsIndex));
    }
  }

  // Define qual rota usar dependendo da Aba selecionada (Geral ou Amigos)
  async function fetchPosts(mode) {
    if (mode === 'friends') return fetchFriendsPostsWithFallback();
    return normalizePostsPayload(await apiJSON('/api/posts/feed/')).filter((post) => !isCommunityPost(post));
  }

  function scrollToHighlightedPost() {
    if (!highlightedPostId) return;
    const postEl = document.getElementById(`post-${highlightedPostId}`);
    if (!postEl) return;
    postEl.classList.add('post-card-highlight');
    setTimeout(() => postEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }

  // Renderiza no ecrã utilizando o post-ui.js global
  function renderPosts(posts) {
    postsContainer.innerHTML = '';

    if (!posts || posts.length === 0) {
      postsContainer.innerHTML = currentMode === 'friends'
        ? '<p class="text-center mt-4 text-muted">Nenhuma publicação dos seus amigos ainda.</p>'
        : '<p class="text-center mt-4 text-muted">Nenhuma publicação ainda.</p>';
      return;
    }

    if (highlightedPostId) ConectaPosts.openPostComments(highlightedPostId);

    postsContainer.innerHTML = posts.map((post) => ConectaPosts.renderPostCard(post, {
      currentUser,
      showCommunityLabel: false,
      allowCommentInput: true,
      canInteract: true,
    })).join('') + '<footer class="feed-footer">Fim dos posts</footer>';

    scrollToHighlightedPost();
  }

  window.loadPosts = async function loadPosts(silent = false) {
    try {
      if (!silent) postsContainer.innerHTML = '<p class="text-center mt-4 text-muted">Carregando publicações...</p>';
      const posts = await fetchPosts(currentMode);
      renderPosts(posts);
    } catch (error) {
      console.error(error);
      if (!silent) postsContainer.innerHTML = '<p class="text-danger text-center mt-4">Erro ao carregar publicações.</p>';
    }
  };

  // Acção de criar um novo post no Modal
  async function publishFeedPost() {
    const content = postInput.value.trim();
    if (!content) return;

    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicando...';

    try {
      const response = await apiFetch('/api/posts/feed/create/', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('Erro ao publicar.');
      postInput.value = '';
      bootstrap.Modal.getInstance(document.getElementById('newPostModal'))?.hide();
      setActiveTab('general');
      await loadPosts(true);
    } catch (error) {
      alert('Erro ao publicar.');
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publicar';
    }
  }

  // Funções Globais da página de Feed
  window.deletePost = async function(postId) {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/delete/`, { method: 'DELETE' });
      if (response.ok) await loadPosts(true);
    } catch (error) { alert('Erro ao excluir o post.'); }
  };

  window.deleteComment = async function(commentId) {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return;
    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/delete/`, { method: 'DELETE' });
      if (response.ok) await loadPosts(true);
    } catch (error) { alert('Erro ao excluir o comentário.'); }
  };

  window.enablePostEdit = function(postId) {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    if (!contentDiv) return;
    const originalText = contentDiv.querySelector('.post-text')?.textContent || contentDiv.getAttribute('data-raw') || '';
    contentDiv.innerHTML = `<div class="mb-3 mt-2"><textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="280"></textarea><div class="d-flex gap-2 mt-2"><button class="btn btn-sm btn-primary" type="button" onclick="savePostEdit(${postId})">Salvar</button><button class="btn btn-sm btn-secondary" type="button" onclick="loadPosts(true)">Cancelar</button></div></div>`;
    document.getElementById(`edit-post-input-${postId}`).value = originalText;
  };

  window.savePostEdit = async function(postId) {
    const content = document.getElementById(`edit-post-input-${postId}`)?.value.trim();
    if (!content) return;
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/update/`, { method: 'PATCH', body: JSON.stringify({ content }) });
      if (response.ok) await loadPosts(true);
    } catch (error) { console.error(error); }
  };

  window.enableCommentEdit = function(commentId) {
    const textSpan = document.getElementById(`comment-text-content-${commentId}`);
    if (!textSpan) return;
    const originalText = textSpan.textContent || textSpan.getAttribute('data-raw') || '';
    textSpan.innerHTML = `<span class="comment-edit-inline"><input type="text" id="edit-comment-input-${commentId}" class="form-control form-control-sm custom-input" maxlength="200"><button class="btn btn-sm btn-primary" type="button" onclick="saveCommentEdit(${commentId})">Salvar</button><button class="btn btn-sm btn-secondary" type="button" onclick="loadPosts(true)">✕</button></span>`;
    document.getElementById(`edit-comment-input-${commentId}`).value = originalText;
  };

  window.saveCommentEdit = async function(commentId) {
    const content = document.getElementById(`edit-comment-input-${commentId}`)?.value.trim();
    if (!content) return;
    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/update/`, { method: 'PATCH', body: JSON.stringify({ content }) });
      if (response.ok) await loadPosts(true);
    } catch (error) { console.error(error); }
  };

  window.toggleLike = async function(postId, btnElement) {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.addComment = async function(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/comment/`, { method: 'POST', body: JSON.stringify({ content }) });
    if (response.ok) { input.value = ''; ConectaPosts.openPostComments(postId); await loadPosts(true); } 
    else { alert('Erro ao comentar.'); }
  };

  window.toggleCommentLike = async function(commentId, btnElement) {
    const response = await apiFetch(`/api/posts/comment/${commentId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.comment-like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.toggleReplyInput = function(commentId) {
    const box = document.getElementById(`reply-box-${commentId}`);
    box?.classList.toggle('d-none');
    if (box && !box.classList.contains('d-none')) document.getElementById(`reply-input-${commentId}`)?.focus();
  };

  window.addReply = async function(commentId) {
    const input = document.getElementById(`reply-input-${commentId}`);
    const content = input?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/comment/${commentId}/reply/`, { method: 'POST', body: JSON.stringify({ content }) });
    if (response.ok) { input.value = ''; await loadPosts(true); } 
    else { alert('Erro ao responder.'); }
  };

  // Event Listeners
  publishBtn?.addEventListener('click', publishFeedPost);
  postInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      publishFeedPost();
    }
  });

  inlineComposer?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); bootstrap.Modal.getOrCreateInstance(document.getElementById('newPostModal')).show();
    }
  });

  generalTab?.addEventListener('click', () => { setActiveTab('general'); loadPosts(); });
  friendsTab?.addEventListener('click', () => { setActiveTab('friends'); loadPosts(); });

  // ==========================================
  // LÓGICA DO BOTÃO DE REFRESH NO FEED GERAL
  // ==========================================
  const refreshFeedBtn = document.getElementById('refreshFeedBtn');
  if (refreshFeedBtn) {
    refreshFeedBtn.addEventListener('click', async () => {
      const icon = refreshFeedBtn.querySelector('.refresh-icon');
      if (icon) icon.classList.add('spin-animation');
      refreshFeedBtn.disabled = true;

      // Executa a busca em modo "silencioso" para não piscar a tela
      await window.loadPosts(true);

      if (icon) icon.classList.remove('spin-animation');
      refreshFeedBtn.disabled = false;
    });
  }

  setActiveTab('general');
  loadPosts();
});