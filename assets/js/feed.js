/* =========================================================
   Feed: posts gerais, posts de amigos e interação principal
   - Otimizado com travas de duplo clique, Sidebar de sugestões
   - E SKELETON LOADER para carregamento suave
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

    await window.useSWR(
      cacheKey,
      () => fetchPosts(currentMode),
      (posts) => renderPosts(posts),
      {
        silent: silent,
        storage: 'local',
        onLoading: () => {
          postsContainer.innerHTML = `
            <div class="post-card placeholder-glow" style="border: 1px solid var(--border-color); background: var(--post-surface); padding: 1.15rem; border-radius: 1.25rem; display: flex; gap: 1rem; width: 100%;">
              <div class="placeholder rounded-circle" style="width: 50px; height: 50px; background-color: var(--line-color); flex-shrink: 0;"></div>
              <div class="w-100 mt-1">
                <div class="placeholder rounded w-50 mb-2" style="height: 14px; background-color: var(--line-color);"></div>
                <div class="placeholder rounded w-25 mb-4" style="height: 12px; background-color: var(--line-color);"></div>
                <div class="placeholder rounded w-100 mb-2" style="height: 16px; background-color: var(--line-color);"></div>
              </div>
            </div>`.repeat(3);
        },
        onError: (error, hasCache) => {
          if (!silent && !hasCache) postsContainer.innerHTML = '<p class="text-danger text-center mt-4">Erro ao carregar publicações.</p>';
        }
      }
    );
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
      
      // Lemos o que a API devolveu
      const dadosDaAPI = await response.json();
      
      // 1. Algumas APIs devolvem o objeto aninhado. Tentamos desempacotar:
      const novoPost = dadosDaAPI.post || dadosDaAPI.data || dadosDaAPI;
      
      // 2. A MÁGICA AQUI: Se a API não devolver o texto, usamos o texto que acabamos de digitar!
      novoPost.content = novoPost.content || content; 
      
      // 3. Forçamos o autor a ser o usuário logado
      novoPost.author = currentUser;
      
      // 4. Garantimos um ID e uma data caso a API não devolva, para o HTML não quebrar
      novoPost.id = novoPost.id || Date.now();
      novoPost.created_at = novoPost.created_at || new Date().toISOString();

      // Geramos o HTML do card perfeitinho
      const novoPostHTML = ConectaPosts.renderPostCard(novoPost, { 
        currentUser, 
        showCommunityLabel: false,
        allowCommentInput: true,
        canInteract: true 
      });
      
      // Injetamos no topo do feed
      postsContainer.insertAdjacentHTML('afterbegin', novoPostHTML);

      // Limpamos o modal e fechamos
      postInput.value = '';
      bootstrap.Modal.getInstance(document.getElementById('newPostModal'))?.hide();
      setActiveTab('general');
      
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
      
      if (response.ok) {
        // Encontra o card do post no ecrã
        const postCard = document.getElementById(`post-${postId}`);
        if (postCard) {
          // Efeito visual suave antes de desaparecer
          postCard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          postCard.style.opacity = '0';
          postCard.style.transform = 'scale(0.95)';
          
          // Aguarda a animação terminar (300ms) e remove o elemento do DOM
          setTimeout(() => postCard.remove(), 300);
        }
      } else {
        alert('Não foi possível excluir o post. Tente novamente.');
      }
    } catch (error) { 
      alert('Erro de conexão ao tentar excluir o post.'); 
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

  // ==========================================
  // COMUNIDADES SUGERIDAS NA SIDEBAR DIREITA
  // - renderiza sugestões aleatórias a cada carregamento
  // - mantém cache apenas dos dados, não do HTML, para não travar a ordem
  // ==========================================
  const suggestedCommunitiesContainer = document.getElementById('right-sidebar-communities');
  const shuffleSuggestedCommunitiesBtn = document.getElementById('shuffleSuggestedCommunitiesBtn');
  let suggestedCommunitiesPool = [];

  function suggestedSidebarSkeletonHTML() {
    return `
      <div class="right-sidebar-skeleton-item placeholder-glow">
        <span class="placeholder right-sidebar-skeleton-avatar"></span>
        <span class="right-sidebar-skeleton-lines">
          <span class="placeholder col-8"></span>
          <span class="placeholder col-5"></span>
        </span>
      </div>
      <div class="right-sidebar-skeleton-item placeholder-glow">
        <span class="placeholder right-sidebar-skeleton-avatar"></span>
        <span class="right-sidebar-skeleton-lines">
          <span class="placeholder col-7"></span>
          <span class="placeholder col-4"></span>
        </span>
      </div>
    `;
  }

  function uniqueCommunities(communities = []) {
    const seen = new Set();
    return communities
      .map((community) => normalizeCommunity(community))
      .filter((community) => {
        const key = community.slug || community.id || community.name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function shuffleArray(items = []) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  }

  function pickRandomCommunities(communities = [], limit = 3) {
    return shuffleArray(uniqueCommunities(communities)).slice(0, limit);
  }

  function setShuffleButtonLoading(isLoading) {
    if (!shuffleSuggestedCommunitiesBtn) return;
    shuffleSuggestedCommunitiesBtn.disabled = isLoading;
    shuffleSuggestedCommunitiesBtn.classList.toggle('is-loading', isLoading);
  }

  function suggestedCommunitiesLimit() {
    return window.matchMedia('(max-width: 87.5rem), (max-height: 50rem)').matches ? 2 : 3;
  }

  function debounceSidebarRender(callback, delay = 180) {
    let timeoutId;
    return (...args) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => callback(...args), delay);
    };
  }

  function renderSuggestedCommunities(communities = suggestedCommunitiesPool) {
    if (!suggestedCommunitiesContainer) return;

    const suggested = pickRandomCommunities(communities, suggestedCommunitiesLimit());

    if (!suggested.length) {
      suggestedCommunitiesContainer.innerHTML = `
        <div class="right-sidebar-empty-state">
          <strong>Nenhuma sugestão agora.</strong>
          <span>Crie ou participe de comunidades para melhorar as recomendações.</span>
        </div>
      `;
      return;
    }

    suggestedCommunitiesContainer.innerHTML = suggested.map((comm) => {
      const avatar = communityAvatarHTML(comm, 'side-community-avatar suggested-community-avatar');
      const membersCount = getCommunityMemberCount(comm);

      return `
        <a href="community.html?slug=${encodeURIComponent(comm.slug)}" class="side-community-item suggested-community-item text-decoration-none">
          ${avatar}
          <div>
            <strong>${escapeHTML(comm.name)}</strong>
            <span>${membersCount} participante(s)</span>
          </div>
        </a>
      `;
    }).join('');
  }

  function normalizeSuggestedCommunitiesPayload(data = {}) {
    const pools = [
      normalizeArray(data.other_communities, 'results'),
      normalizeArray(data.communities, 'results'),
      normalizeArray(data.my_communities, 'results'),
      normalizeArray(data.results, 'results'),
    ];

    return uniqueCommunities(pools.flat());
  }

  async function loadSuggestedCommunities() {
    if (!suggestedCommunitiesContainer) return;

    const cacheKey = '@conecta:suggested_communities_data';
    const cachedData = sessionStorage.getItem(cacheKey);

    if (cachedData) {
      try {
        suggestedCommunitiesPool = JSON.parse(cachedData);
        renderSuggestedCommunities(suggestedCommunitiesPool);
      } catch (error) {
        sessionStorage.removeItem(cacheKey);
        suggestedCommunitiesContainer.innerHTML = suggestedSidebarSkeletonHTML();
      }
    } else {
      suggestedCommunitiesContainer.innerHTML = suggestedSidebarSkeletonHTML();
    }

    setShuffleButtonLoading(true);

    try {
      const response = await apiFetch('/api/posts/communities/');
      if (!response.ok) throw new Error('Erro na API');
      const data = await response.json();
      const communities = normalizeSuggestedCommunitiesPayload(data);

      if (!communities.length) {
        if (!suggestedCommunitiesPool.length) renderSuggestedCommunities([]);
        return;
      }

      suggestedCommunitiesPool = communities;
      sessionStorage.setItem(cacheKey, JSON.stringify(communities));
      renderSuggestedCommunities(suggestedCommunitiesPool);
    } catch (error) {
      if (!suggestedCommunitiesPool.length) {
        suggestedCommunitiesContainer.innerHTML = `
          <div class="right-sidebar-empty-state">
            <strong>Não foi possível carregar.</strong>
            <span>Tente atualizar as sugestões em alguns instantes.</span>
          </div>
        `;
      }
    } finally {
      setShuffleButtonLoading(false);
    }
  }

  shuffleSuggestedCommunitiesBtn?.addEventListener('click', () => {
    renderSuggestedCommunities(suggestedCommunitiesPool);
  });

  window.addEventListener('resize', debounceSidebarRender(() => {
    if (suggestedCommunitiesPool.length) renderSuggestedCommunities(suggestedCommunitiesPool);
  }, 180));

  loadSuggestedCommunities().catch(console.error);

});