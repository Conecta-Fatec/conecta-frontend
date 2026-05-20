/* =========================================================
   Feed: posts gerais, posts de amigos e interação principal
   - Otimizado com travas de duplo clique
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
    ConectaPosts.currentUser = currentUser;
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

  async function fetchFriendsPostsWithFallback() {
    const [allPosts, friendsIndex] = await Promise.all([
      apiJSON('/api/posts/feed/').then(normalizePostsPayload),
      loadFriendsIndex(),
    ]);

    return allPosts.filter((post) => !isCommunityPost(post) && isPostFromFriend(post, friendsIndex));
  }

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

  function renderPosts(posts) {
    postsContainer.innerHTML = '';

    if (!posts || posts.length === 0) {
      postsContainer.innerHTML = currentMode === 'friends'
        ? '<p class="text-center mt-4 text-muted">Nenhuma publicação dos seus amigos ainda.</p>'
        : '<p class="text-center mt-4 text-muted">Nenhuma publicação ainda.</p>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => ConectaPosts.renderPostCard(post, {
      currentUser,
      showCommunityLabel: false,
      allowCommentInput: true,
      canInteract: true,
    })).join('') + '<footer class="feed-footer">Fim dos posts</footer>';

    if (highlightedPostId) ConectaPosts.openPostComments(highlightedPostId);
    scrollToHighlightedPost();
  }
  
  window.loadPosts = async function loadPosts(silent = false) {
    const cacheKey = currentMode === 'friends' ? '@conecta:cache_feed_friends' : '@conecta:cache_feed_general';

    try {
      const cacheSalvo = localStorage.getItem(cacheKey);
      if (cacheSalvo && !silent) {
        const postsEmCache = JSON.parse(cacheSalvo);
        renderPosts(postsEmCache);
        console.log(`[Cache] Feed (${currentMode}) carregado instantaneamente!`);
        silent = true; 
      }

      if (!silent) {
        postsContainer.innerHTML = '<p class="text-center mt-4 text-muted">Carregando publicações...</p>';
      }

      const posts = await fetchPosts(currentMode);

      if (JSON.stringify(posts) !== cacheSalvo) {
        localStorage.setItem(cacheKey, JSON.stringify(posts));
        renderPosts(posts);
        console.log(`[API] Tela atualizada com novos posts na aba ${currentMode}!`);
      }

    } catch (error) {
      console.error(error);
      if (!silent) {
        postsContainer.innerHTML = '<p class="text-danger text-center mt-4">Erro ao carregar publicações.</p>';
      }
    }
  };

  async function publishFeedPost() {
    const content = postInput.value.trim();
    if (!content) return;

    if (!window.travarBotao(publishBtn, true)) return;

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
      window.destravarBotao(publishBtn, true);
    }
  }

  window.deletePost = async function(postId, btnElement) {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    if (btnElement && !window.travarBotao(btnElement)) return;
    
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/delete/`, { method: 'DELETE' });
      if (response.ok) await loadPosts(true);
    } catch (error) { 
      alert('Erro ao excluir o post.'); 
    } finally {
      if (btnElement) window.destravarBotao(btnElement);
    }
  };

  window.deleteComment = async function(commentId, btnElement) {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return;
    if (btnElement && !window.travarBotao(btnElement)) return;
    
    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/delete/`, { method: 'DELETE' });
      if (response.ok) await loadPosts(true);
    } catch (error) { 
      alert('Erro ao excluir o comentário.'); 
    } finally {
      if (btnElement) window.destravarBotao(btnElement);
    }
  };

  window.enablePostEdit = function(postId) {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    if (!contentDiv) return;
    const originalText = contentDiv.querySelector('.post-text')?.textContent || contentDiv.getAttribute('data-raw') || '';
    contentDiv.innerHTML = `<div class="mb-3 mt-2"><textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="280"></textarea><div class="d-flex gap-2 mt-2"><button class="btn btn-sm btn-primary" type="button" onclick="savePostEdit(${postId}, this)">Salvar</button><button class="btn btn-sm btn-secondary" type="button" onclick="loadPosts(true)">Cancelar</button></div></div>`;
    document.getElementById(`edit-post-input-${postId}`).value = originalText;
  };

  window.savePostEdit = async function(postId, btnElement) {
    const content = document.getElementById(`edit-post-input-${postId}`)?.value.trim();
    if (!content) return;
    if (btnElement && !window.travarBotao(btnElement, true)) return;

    try {
      const response = await apiFetch(`/api/posts/post/${postId}/update/`, { method: 'PATCH', body: JSON.stringify({ content }) });
      if (response.ok) await loadPosts(true);
    } catch (error) { 
      console.error(error); 
    } finally {
      if (btnElement) window.destravarBotao(btnElement, true);
    }
  };

  window.enableCommentEdit = function(commentId) {
    const textSpan = document.getElementById(`comment-text-content-${commentId}`);
    if (!textSpan) return;
    const originalText = textSpan.textContent || textSpan.getAttribute('data-raw') || '';
    textSpan.innerHTML = `<span class="comment-edit-inline"><input type="text" id="edit-comment-input-${commentId}" class="form-control form-control-sm custom-input" maxlength="200"><button class="btn btn-sm btn-primary py-0 px-2" type="button" onclick="saveCommentEdit(${commentId}, this)">Salvar</button><button class="btn btn-sm btn-secondary py-0 px-2" type="button" onclick="loadPosts(true)">✕</button></span>`;
    document.getElementById(`edit-comment-input-${commentId}`).value = originalText;
  };

  window.saveCommentEdit = async function(commentId, btnElement) {
    const content = document.getElementById(`edit-comment-input-${commentId}`)?.value.trim();
    if (!content) return;
    if (btnElement && !window.travarBotao(btnElement, true)) return;

    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/update/`, { method: 'PATCH', body: JSON.stringify({ content }) });
      if (response.ok) await loadPosts(true);
    } catch (error) { 
      console.error(error); 
    } finally {
      if (btnElement) window.destravarBotao(btnElement, true);
    }
  };

  window.toggleLike = async function(postId, btnElement) {
    if (btnElement && !window.travarBotao(btnElement, false)) return;
    
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      const svg = btnElement.querySelector('svg');
      btnElement.classList.toggle('text-primary-custom', !!data?.liked);
      if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
      btnElement.querySelector('.like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
    } finally {
      if (btnElement) window.destravarBotao(btnElement, false);
    }
  };

  window.addComment = async function(postId) {
    window.openPostCommentBox(null, postId);
  };

  window.toggleCommentLike = async function(commentId, btnElement) {
    if (btnElement && !window.travarBotao(btnElement, false)) return;

    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/like/`, { method: 'POST' });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      const svg = btnElement.querySelector('svg');
      btnElement.classList.toggle('text-primary-custom', !!data?.liked);
      if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
      btnElement.querySelector('.comment-like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
    } finally {
      if (btnElement) window.destravarBotao(btnElement, false);
    }
  };

  window.toggleReplyInput = function(commentId) {
    const box = document.getElementById(`reply-box-${commentId}`);
    box?.classList.toggle('d-none');
    if (box && !box.classList.contains('d-none')) document.getElementById(`reply-input-${commentId}`)?.focus();
  };

  window.addReply = async function(commentId, btnElement) {
    const input = document.getElementById(`reply-input-${commentId}`);
    const content = input?.value.trim();
    if (!content) return;
    if (btnElement && !window.travarBotao(btnElement, true)) return;

    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/reply/`, { method: 'POST', body: JSON.stringify({ content }) });
      if (response.ok) { 
        input.value = ''; 
        await loadPosts(true); 
      } else { 
        alert('Erro ao responder.'); 
      }
    } finally {
      if (btnElement) window.destravarBotao(btnElement, true);
    }
  };

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

  const refreshFeedBtn = document.getElementById('refreshFeedBtn');
  if (refreshFeedBtn) {
    refreshFeedBtn.addEventListener('click', async () => {
      const icon = refreshFeedBtn.querySelector('.refresh-icon');
      if (icon) icon.classList.add('spin-animation');
      refreshFeedBtn.disabled = true;
      await window.loadPosts(true);
      if (icon) icon.classList.remove('spin-animation');
      refreshFeedBtn.disabled = false;
    });
  }

  setActiveTab('general');
  loadPosts();
});