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
    const selectedGifInput = document.getElementById('selected-gif-url');
    const gifUrl = selectedGifInput ? selectedGifInput.value : '';
    const errorMsg = document.getElementById('post-error-msg'); // Pega nossa nova mensagem

    // Esconde o erro toda vez que ele tenta publicar de novo
    if (errorMsg) errorMsg.classList.add('d-none');

    // Validação nova: Obriga a ter texto!
    if (!content) {
        if (errorMsg) {
            errorMsg.textContent = "Você precisa escrever algo no post!";
            errorMsg.classList.remove('d-none');
        }
        return; 
    }

    if (!window.travarBotao(publishBtn, true)) return;

    try {
      const response = await apiFetch('/api/posts/feed/create/', {
        method: 'POST',
        body: JSON.stringify({ content: content, gif_url: gifUrl }),
      });
      if (!response.ok) throw new Error('Erro ao publicar no servidor.');
      
      const dadosDaAPI = await response.json();
      const novoPost = dadosDaAPI.post || dadosDaAPI.data || dadosDaAPI;
      
      novoPost.content = novoPost.content || content; 
      novoPost.gif_url = novoPost.gif_url || gifUrl;
      novoPost.author = currentUser;
      novoPost.id = novoPost.id || Date.now();
      novoPost.created_at = novoPost.created_at || new Date().toISOString();

      const novoPostHTML = ConectaPosts.renderPostCard(novoPost, { 
        currentUser, 
        showCommunityLabel: false,
        allowCommentInput: true,
        canInteract: true 
      });
      
      postsContainer.insertAdjacentHTML('afterbegin', novoPostHTML);

      postInput.value = '';
      if (gifUrl) document.getElementById('btn-remove-gif').click(); 
      bootstrap.Modal.getInstance(document.getElementById('newPostModal'))?.hide();
      setActiveTab('general');
      
    } catch (error) {
      // Se der erro de conexão, mostra na interface também
      if (errorMsg) {
          errorMsg.textContent = "Ops! Ocorreu um erro ao conectar com o servidor.";
          errorMsg.classList.remove('d-none');
      }
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
    
    // Guarda o texto original de forma segura
    const originalText = contentDiv.getAttribute('data-raw') || contentDiv.querySelector('.post-text')?.textContent || '';
    
    // Troca o parágrafo pela caixa de texto. Repare que o Cancelar agora chama cancelPostEdit
    contentDiv.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="280"></textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" type="button" onclick="savePostEdit(${postId}, this)">Salvar</button>
          <button class="btn btn-sm btn-secondary" type="button" onclick="cancelPostEdit(${postId})">Cancelar</button>
        </div>
      </div>
    `;
    document.getElementById(`edit-post-input-${postId}`).value = originalText;
  };

  // Função nova para não recarregar o feed se o utilizador desistir de editar
  window.cancelPostEdit = function(postId) {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    if (!contentDiv) return;
    
    const originalText = contentDiv.getAttribute('data-raw') || '';
    contentDiv.innerHTML = `<p class="post-text">${escapeHTML(originalText)}</p>`;
  };

  window.savePostEdit = async function(postId, btnElement) {
    const content = document.getElementById(`edit-post-input-${postId}`)?.value.trim();
    if (!content) return;
    if (btnElement && !window.travarBotao(btnElement, true)) return;

    try {
      const response = await apiFetch(`/api/posts/post/${postId}/update/`, { method: 'PATCH', body: JSON.stringify({ content }) });
      
      if (response.ok) {
        const contentDiv = document.getElementById(`post-text-content-${postId}`);
        if (contentDiv) {
          // Atualiza o atributo oculto com o texto novo
          contentDiv.setAttribute('data-raw', content);
          // Substitui a caixa de formulário pelo parágrafo atualizado
          contentDiv.innerHTML = `<p class="post-text">${escapeHTML(content)}</p>`;
          
          // (Opcional) Adiciona o selo "· editado" no cabeçalho do post se ainda não existir
          const headerMain = document.querySelector(`#post-${postId} .post-header-main`);
          if (headerMain && !headerMain.querySelector('.post-edited-label')) {
            headerMain.insertAdjacentHTML('beforeend', '<small class="post-edited-label"> · editado</small>');
          }
        }
      } else {
        alert('Não foi possível salvar a edição.');
      }
    } catch (error) { 
      console.error(error); 
      alert('Erro de conexão ao tentar atualizar o post.');
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

// Cole a chave que você gerou no site do Giphy aqui:
const GIPHY_API_KEY = '2zqiG8Ems0HGkwRQetEHW7cj7fodVumy'; 

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenGif = document.getElementById('btn-open-gif');
  const gifContainer = document.getElementById('gif-search-container');
  const gifSearchInput = document.getElementById('gif-search-input');
  const gifResults = document.getElementById('gif-results');
  const selectedGifInput = document.getElementById('selected-gif-url');
  const gifPreviewContainer = document.getElementById('gif-preview-container');
  const gifPreviewImg = document.getElementById('gif-preview-img');
  const btnRemoveGif = document.getElementById('btn-remove-gif');

  // 1. Abre/Fecha a caixa de pesquisa de GIFs
  if(btnOpenGif) {
      btnOpenGif.addEventListener('click', () => {
          gifContainer.classList.toggle('d-none');
          // Se abriu a caixa, já carrega os GIFs em alta (Trending)
          if (!gifContainer.classList.contains('d-none')) {
              loadGifs(''); 
          }
      });
  }

  // 2. Busca GIFs conforme o usuário digita
  let searchTimeout;
  if(gifSearchInput) {
      gifSearchInput.addEventListener('input', (e) => {
          clearTimeout(searchTimeout);
          // Espera o usuário parar de digitar por 500ms para não travar a API
          searchTimeout = setTimeout(() => {
              loadGifs(e.target.value);
          }, 500); 
      });
  }

  // 3. Faz a requisição direto para o servidor do Giphy
  async function loadGifs(query) {
      gifResults.innerHTML = '<p class="text-muted small w-100 text-center mt-2">Carregando...</p>';
      
      const url = query.trim() === ''
          ? `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=12`
          : `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=12`;

      try {
          const response = await fetch(url);
          const data = await response.json();
          renderGifs(data.data);
      } catch (error) {
          gifResults.innerHTML = '<p class="text-danger small w-100 text-center mt-2">Erro ao carregar GIFs.</p>';
      }
  }

  // 4. Desenha as imagens na tela
  function renderGifs(gifs) {
      if (!gifs || gifs.length === 0) {
          gifResults.innerHTML = '<p class="text-muted small w-100 text-center mt-2">Nenhum GIF encontrado.</p>';
          return;
      }

      const html = gifs.map(gif => {
          // Pegamos a versão leve para carregar a lista rápido
          const gifUrl = gif.images.fixed_height_small.url;
          // Pegamos a versão com qualidade boa para salvar no banco
          const originalUrl = gif.images.downsized.url;

          return `<img src="${gifUrl}" style="cursor:pointer; height: 80px; border-radius: 4px; object-fit: cover;"
                       onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'"
                       onclick="selectGif('${originalUrl}')" alt="GIF">`;
      }).join('');

      gifResults.innerHTML = html;
  }

  // 5. O que acontece quando o usuário clica num GIF
  window.selectGif = function(url) {
      selectedGifInput.value = url; // Guarda a URL no input invisível
      gifPreviewImg.src = url; // Mostra a imagem
      gifPreviewContainer.classList.remove('d-none'); // Revela a área de pré-visualização
      gifContainer.classList.add('d-none'); // Esconde a caixa de pesquisa
      gifSearchInput.value = ''; // Limpa a barra de pesquisa
  };

  // 6. Botão de remover o GIF se o usuário desistir
  if(btnRemoveGif) {
      btnRemoveGif.addEventListener('click', () => {
          selectedGifInput.value = '';
          gifPreviewImg.src = '';
          gifPreviewContainer.classList.add('d-none');
      });
  }
});