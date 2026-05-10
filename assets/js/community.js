/* =========================================================
   Comunidade: detalhes, membros e posts internos (OTIMIZADO)
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  // Verifica se o utilizador está logado antes de carregar a página
  if (!requireAuth()) return;

  // Captura os parâmetros da URL (ex: ?slug=comunidade-teste&post=123)
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');
  const highlightedPostId = urlParams.get('post');

  // Se não houver slug, redireciona de volta para a lista de comunidades
  if (!slug) {
    window.location.href = 'communities.html';
    return;
  }

  let currentUser = await loadLoggedUser();
  let currentCommunity = null;
  let currentSlug = slug;
  let editCommunityModal = null;

  if (window.ConectaPosts) ConectaPosts.currentUserNickname = currentUser?.nickname || '';

  // Elementos do DOM (HTML)
  const commName = document.getElementById('comm-name');
  const commDesc = document.getElementById('comm-desc');
  const commCreator = document.getElementById('comm-creator');
  const commMembersCount = document.getElementById('comm-members-count');
  const commAvatar = document.getElementById('comm-avatar');
  const commActionBtn = document.getElementById('comm-action-btn');
  const deleteCommunityBtn = document.getElementById('delete-community-btn');
  const postsContainer = document.getElementById('community-posts-container');
  const membersContainer = document.getElementById('community-members-container');
  const publishBtn = document.getElementById('publishCommunityPostBtn');
  const saveCommunityBtn = document.getElementById('saveCommunityBtn');
  const createPostCard = document.getElementById('community-create-post-card');
  const communityGeneralTab = document.getElementById('community-general-tab');
  const communityFriendsTab = document.getElementById('community-friends-tab');

  // Cache local para guardar os posts e evitar requisições desnecessárias
  let communityPostsCache = [];
  let currentIsMember = false;
  let currentPostMode = 'general';
  let cachedFriends = { ids: new Set(), nicknames: new Set() };

  // --- Funções Auxiliares de Tratamento de Dados ---

  // Descobre quem é o criador da comunidade lidando com diferentes formatos de resposta da API
  function creatorFromCommunity(community = {}) {
    return community.creator || community.created_by || community.owner || {
      nickname: community.creator_nickname,
      full_name: community.creator_name,
      first_name: community.creator_first_name,
      last_name: community.creator_last_name,
      photo_url: community.creator_photo,
    };
  }

  function isSameUser(a = {}, b = {}) {
    const first = userProfileSource(a);
    const second = userProfileSource(b);
    return Boolean(
      (first.id && second.id && Number(first.id) === Number(second.id)) ||
      (first.nickname && second.nickname && first.nickname === second.nickname)
    );
  }

  function memberJoinedDate(member = {}) {
    const raw = member.joined_at || member.membership_created_at || member.created_at || member.date_joined || '';
    const time = raw ? new Date(raw).getTime() : Number.POSITIVE_INFINITY;
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
  }

  // Normaliza os dados da comunidade recebidos da API
  function normalizeCommunityDetails(data = {}) {
    const community = normalizeCommunity(data.community || data, data.members_count);
    const members = normalizeArray(data.members, 'results').length
      ? normalizeArray(data.members, 'results')
      : normalizeArray(community.members, 'results');
    const posts = normalizeArray(data.posts, 'results', 'items');
    const isMember = Boolean(data.is_member ?? community.is_member ?? community.member ?? community.is_creator);
    return {
      community,
      members,
      posts,
      isMember,
      membersCount: getCommunityMemberCount(community, data.members_count || members.length),
    };
  }

  // --- Funções de Renderização Visual (HTML) ---

  function renderCommunityAvatar(community = {}) {
    commAvatar.classList.remove('has-image');
    commAvatar.setAttribute('data-photo-viewer', 'community');
    commAvatar.dataset.photoTitle = community.name || 'Comunidade';

    if (communityPhoto(community)) {
      commAvatar.innerHTML = `<img src="${escapeHTML(toApiUrl(communityPhoto(community)))}" alt="Foto da comunidade ${escapeHTML(community.name)}">`;
      commAvatar.classList.add('has-image');
    } else {
      commAvatar.textContent = getInitials(community.name);
    }
  }

  // Renderiza a lista de membros, colocando sempre o criador no topo
  function renderMembers(members = [], community = {}) {
    const creator = creatorFromCommunity(community);
    const unique = [];

    if (creator?.nickname || creator?.id) unique.push({ ...creator, __creator: true });

    members.forEach((member) => {
      if (!unique.some((item) => isSameUser(item, member))) unique.push(member);
    });

    const sorted = unique.sort((a, b) => {
      if (a.__creator) return -1;
      if (b.__creator) return 1;
      return memberJoinedDate(a) - memberJoinedDate(b);
    });

    if (!sorted.length) {
      membersContainer.innerHTML = '<div class="api-empty-state">Nenhum participante ainda.</div>';
      return;
    }

    membersContainer.innerHTML = sorted.map((member) => {
      const memberUser = userProfileSource(member);
      const name = userDisplayName(memberUser);
      const nickname = memberUser.nickname || memberUser.username || 'usuario';

      return `
        <a href="${profileUrlFor(memberUser)}" class="side-community-item member-item ${member.__creator ? 'member-creator' : ''}">
          ${avatarHTML(memberUser, 'side-community-avatar')}
          <div>
            <strong>${escapeHTML(name)} ${member.__creator ? '<span class="creator-crown" title="Criador da comunidade">♛</span>' : ''}</strong>
            <span>@${escapeHTML(nickname)}${member.__creator ? ' · criador' : ''}</span>
          </div>
        </a>
      `;
    }).join('');
  }

  // Controla as abas de "Todos os Posts" e "Apenas Amigos"
  function setActiveCommunityTab(mode) {
    currentPostMode = mode;
    communityGeneralTab?.classList.toggle('active', mode === 'general');
    communityFriendsTab?.classList.toggle('active', mode === 'friends');
  }

  // Carrega e guarda em cache a lista de amigos para não fazer várias requisições
  async function loadFriendsIndex() {
    if (cachedFriends.ids.size || cachedFriends.nicknames.size) return cachedFriends;

    try {
      const data = await apiJSON('/api/users/friends/');
      const friends = normalizeArray(data, 'friends', 'results');

      cachedFriends = {
        ids: new Set(friends.map((friend) => Number(friend.id)).filter(Number.isFinite)),
        nicknames: new Set(friends.map((friend) => friend.nickname).filter(Boolean)),
      };
    } catch (error) {
      console.error('Erro ao carregar amigos para filtrar posts da comunidade:', error);
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

  async function getVisibleCommunityPosts() {
    if (currentPostMode === 'general') return communityPostsCache;

    const friendsIndex = await loadFriendsIndex();
    return communityPostsCache.filter((post) => isPostFromFriend(post, friendsIndex));
  }

  async function renderVisibleCommunityPosts() {
    const visiblePosts = await getVisibleCommunityPosts();
    renderPosts(visiblePosts, currentIsMember);
  }
  
  // Preenche todos os dados do cabeçalho da comunidade
  function renderCommunityDetails(data) {
    const { community, members, posts, isMember, membersCount } = normalizeCommunityDetails(data);
    currentCommunity = community;
    currentSlug = community.slug || currentSlug;

    const creator = creatorFromCommunity(community);
    const creatorName = userDisplayName(creator);
    const creatorNickname = creator.nickname || community.creator_nickname || '';

    commName.textContent = community.name || 'Comunidade';
    commDesc.textContent = community.description || 'Sem descrição.';
    commMembersCount.textContent = `${membersCount} participante(s)`;
    commCreator.innerHTML = creatorNickname
      ? `Criada por ${userLinkHTML({ ...creator, nickname: creatorNickname }, `@${creatorNickname}`, 'nickname-link')}`
      : `Criada por ${escapeHTML(creatorName)}`;

    renderCommunityAvatar(community);

    commActionBtn.style.display = 'inline-flex';
    deleteCommunityBtn.style.display = community.is_creator ? 'inline-flex' : 'none';
    createPostCard.style.display = isMember ? 'block' : 'none'; // Só mostra o input de post se for membro

    // Define a ação do botão principal (Entrar, Sair ou Editar)
    if (community.is_creator) {
      commActionBtn.textContent = 'Editar comunidade';
      commActionBtn.className = 'btn btn-outline-primary fw-bold';
      commActionBtn.onclick = openEditCommunityModal;
    } else if (isMember) {
      commActionBtn.textContent = 'Sair da comunidade';
      commActionBtn.className = 'btn btn-outline-danger fw-bold';
      commActionBtn.onclick = leaveCommunity;
    } else {
      commActionBtn.textContent = 'Participar';
      commActionBtn.className = 'btn btn-primary fw-bold';
      commActionBtn.onclick = joinCommunity;
    }

    communityPostsCache = posts;
    currentIsMember = isMember;

    renderMembers(members, community);
    renderVisibleCommunityPosts();
  }

  function scrollToHighlightedPost() {
    if (!highlightedPostId) return;
    const postEl = document.getElementById(`post-${highlightedPostId}`);
    if (!postEl) return;
    postEl.classList.add('post-card-highlight');
    setTimeout(() => postEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }

  // Renderiza a lista de posts no ecrã principal da comunidade
  function renderPosts(posts = [], isMember) {
    if (!posts.length) {
      postsContainer.innerHTML = currentPostMode === 'friends'
        ? '<div class="api-empty-state text-center">Nenhum post de amigos nesta comunidade ainda.</div>'
        : '<div class="api-empty-state text-center">Nenhum post nesta comunidade ainda.</div>';
      return;
    }

    if (highlightedPostId && window.ConectaPosts) ConectaPosts.openPostComments(highlightedPostId);

    postsContainer.innerHTML = posts.map((post) => ConectaPosts.renderPostCard(post, {
      currentUser,
      showCommunityLabel: false, // Oculta a etiqueta porque já estamos dentro da comunidade
      allowCommentInput: isMember,
      canInteract: isMember,
    })).join('') + '<footer class="feed-footer community-posts-end">Fim dos posts</footer>';

    scrollToHighlightedPost();
  }

  // --- Funções de Comunicação com a API ---

  async function loadCommunityDetails() {
    try {
      const response = await apiFetch(`/api/posts/communities/${currentSlug}/`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        commName.textContent = 'Comunidade não encontrada';
        commDesc.textContent = getApiError(data, 'Esta comunidade não existe ou foi excluída.');
        postsContainer.innerHTML = '';
        membersContainer.innerHTML = '';
        return;
      }

      renderCommunityDetails(data || {});
    } catch (error) {
      console.error(error);
      commDesc.textContent = 'Erro ao conectar com o servidor.';
    }
  }

  async function joinCommunity() {
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/join/`, { method: 'POST' });
    if (response.ok) await loadCommunityDetails();
  }

  async function leaveCommunity() {
    if (!confirm('Tem certeza que deseja sair desta comunidade?')) return;
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/leave/`, { method: 'POST' });
    if (response.ok) window.location.href = 'communities.html';
  }

  // --- Lógica do Modal de Edição da Comunidade ---
  function openEditCommunityModal() {
    document.getElementById('editCommunityName').value = currentCommunity.name || '';
    document.getElementById('editCommunityBio').value = currentCommunity.description || '';
    if (document.getElementById('editCommunityPhoto')) document.getElementById('editCommunityPhoto').value = '';
    document.getElementById('editCommunityError').style.display = 'none';
    editCommunityModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editCommunityModal'));
    editCommunityModal.show();
  }

  saveCommunityBtn.addEventListener('click', async () => {
    const name = document.getElementById('editCommunityName').value.trim();
    const description = document.getElementById('editCommunityBio').value.trim();
    const photo = document.getElementById('editCommunityPhoto')?.files?.[0];
    const error = document.getElementById('editCommunityError');

    error.style.display = 'none';
    saveCommunityBtn.disabled = true;
    saveCommunityBtn.textContent = 'Salvando...';

    try {
      let body;
      if (photo) {
        body = new FormData();
        body.append('name', name);
        body.append('description', description);
        body.append('photo', photo);
      } else {
        body = JSON.stringify({ name, description });
      }

      const response = await apiFetch(`/api/posts/communities/${currentSlug}/update/`, {
        method: 'PATCH',
        body,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        error.textContent = getApiError(data, 'Erro ao editar comunidade.');
        error.style.display = 'block';
        return;
      }

      editCommunityModal.hide();
      // Atualiza o slug na URL se o nome da comunidade mudou
      if (data?.community?.slug && data.community.slug !== currentSlug) {
        window.history.replaceState({}, '', `community.html?slug=${encodeURIComponent(data.community.slug)}`);
        currentSlug = data.community.slug;
      }
      await loadCommunityDetails();
    } catch (err) {
      console.error(err);
      error.textContent = 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      saveCommunityBtn.disabled = false;
      saveCommunityBtn.textContent = 'Salvar';
    }
  });

  deleteCommunityBtn.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja excluir esta comunidade?')) return;
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/delete/`, { method: 'DELETE' });
    if (response.ok) window.location.href = 'communities.html';
  });

  // =========================================================================
  // OTIMIZAÇÃO: Criação de post direta
  // Evita o loop infinito de 404s que sobrecarregava o servidor Render
  // =========================================================================
  async function createCommunityPost(content) {
    const payload = typeof buildCommunityPostPayload === 'function' 
        ? buildCommunityPostPayload(content, currentCommunity || { slug: currentSlug })
        : { content };

    // Tenta primeiro a rota direta da comunidade
    let response = await apiFetch(`/api/posts/communities/${currentSlug}/post/create/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    // Se a rota específica der 404, faz o fallback inteligente para o feed geral,
    // enviando a flag da comunidade junto no payload para ser classificado corretamente.
    if (!response.ok && response.status === 404) {
      response = await apiFetch('/api/posts/feed/create/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(getApiError(data, 'Erro ao publicar.'));
    
    return { response, data };
  }

  // Ação de publicar (Ouve o clique do botão no modal)
  publishBtn.addEventListener('click', async () => {
    const contentEl = document.getElementById('communityPostContent');
    const error = document.getElementById('communityPostError');
    const content = contentEl.value.trim();

    error.style.display = 'none';
    if (!content) return;

    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicando...';

    try {
      await createCommunityPost(content);
      contentEl.value = '';
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityPostModal')).hide();
      await loadCommunityDetails();
    } catch (err) {
      console.error(err);
      error.textContent = err.message || 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publicar';
    }
  });

  // --- Funções de Interação Global (Expostas para o HTML) ---

  window.toggleLike = async (postId, btnElement = null) => {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    if (!btnElement) return loadCommunityDetails();
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.addComment = async (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/comment/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response.ok) {
      if(window.ConectaPosts) ConectaPosts.openPostComments(postId);
      await loadCommunityDetails();
    }
  };

  window.toggleCommentLike = async (commentId, btnElement = null) => {
    const response = await apiFetch(`/api/posts/comment/${commentId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    if (!btnElement) return loadCommunityDetails();
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.comment-like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.deletePost = async (postId) => {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    const response = await apiFetch(`/api/posts/post/${postId}/delete/`, { method: 'DELETE' });
    if (response.ok) await loadCommunityDetails();
  };

  window.enablePostEdit = (postId) => {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    if (!contentDiv) return;
    const originalText = contentDiv.querySelector('.post-text')?.textContent || contentDiv.dataset.raw || '';
    contentDiv.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="280"></textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" type="button" onclick="savePostEdit(${postId})">Salvar</button>
          <button class="btn btn-sm btn-secondary" type="button" onclick="loadCommunityDetailsFromButton()">Cancelar</button>
        </div>
      </div>`;
    document.getElementById(`edit-post-input-${postId}`).value = originalText;
  };

  window.savePostEdit = async (postId) => {
    const content = document.getElementById(`edit-post-input-${postId}`)?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
  };

  window.enableCommentEdit = (commentId) => {
    const textSpan = document.getElementById(`comment-text-content-${commentId}`);
    if (!textSpan) return;
    const originalText = textSpan.textContent || textSpan.dataset.raw || '';
    textSpan.innerHTML = `
      <span class="comment-edit-inline">
        <input type="text" id="edit-comment-input-${commentId}" class="form-control form-control-sm custom-input" maxlength="200">
        <button class="btn btn-sm btn-primary py-0 px-2" type="button" onclick="saveCommentEdit(${commentId})">Salvar</button>
        <button class="btn btn-sm btn-secondary py-0 px-2" type="button" onclick="loadCommunityDetailsFromButton()">✕</button>
      </span>`;
    document.getElementById(`edit-comment-input-${commentId}`).value = originalText;
  };

  window.saveCommentEdit = async (commentId) => {
    const content = document.getElementById(`edit-comment-input-${commentId}`)?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/comment/${commentId}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
  };

  window.deleteComment = async (commentId) => {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return;
    const response = await apiFetch(`/api/posts/comment/${commentId}/delete/`, { method: 'DELETE' });
    if (response.ok) await loadCommunityDetails();
  };

  window.toggleReplyInput = (commentId) => {
    const box = document.getElementById(`reply-box-${commentId}`);
    box?.classList.toggle('d-none');
    if (box && !box.classList.contains('d-none')) document.getElementById(`reply-input-${commentId}`)?.focus();
  };

  window.addReply = async (commentId) => {
    const input = document.getElementById(`reply-input-${commentId}`);
    const content = input?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/comment/${commentId}/reply/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
    else alert('Erro ao responder.');
  };

  window.loadCommunityDetailsFromButton = loadCommunityDetails;

  // Lógica dos eventos de clique nas abas (Geral / Amigos)
  communityGeneralTab?.addEventListener('click', () => {
    setActiveCommunityTab('general');
    renderVisibleCommunityPosts();
  });

  communityFriendsTab?.addEventListener('click', () => {
    setActiveCommunityTab('friends');
    renderVisibleCommunityPosts();
  });

  // Inicializa carregando os dados da comunidade
  await loadCommunityDetails();
});