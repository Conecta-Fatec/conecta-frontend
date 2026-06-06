/* =========================================================
   Comunidade: detalhes, membros, posts, Skeleton e Cache
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');
  const highlightedPostId = urlParams.get('post');

  if (!slug) {
    window.location.href = 'communities.html';
    return;
  }

  let currentUser = null;
  let currentCommunity = null;
  let currentSlug = slug;
  let editCommunityModal = null;
  let commCropper = null;

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
  const communitySidebarPostBtn = document.getElementById('communitySidebarPostBtn');
  const communityMobilePostFab = document.getElementById('communityMobilePostFab');
  const communityHero = document.querySelector('.community-page-hero');
  const communityGeneralTab = document.getElementById('community-general-tab');
  const communityFriendsTab = document.getElementById('community-friends-tab');

  const SIDE_LIST_BATCH_SIZE = 5;
  let communityPostsCache = [];
  let communityMembersVisible = SIDE_LIST_BATCH_SIZE;
  let currentIsMember = false;
  let currentPostMode = 'general';
  let cachedFriends = { ids: new Set(), nicknames: new Set() };

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


  function nextPagePath(nextUrl, currentPath) {
    if (!nextUrl) return '';
    const next = String(nextUrl).trim();
    if (!next) return '';

    try {
      if (next.startsWith('http://') || next.startsWith('https://')) {
        const url = new URL(next);
        return `${url.pathname}${url.search}`;
      }
      if (next.startsWith('/')) return next;
      if (next.startsWith('?')) return `${String(currentPath).split('?')[0]}${next}`;
      return next;
    } catch (error) {
      console.warn('Não foi possível interpretar a próxima página da comunidade:', error);
      return '';
    }
  }

  function postsPayloadFromCommunityData(data = {}) {
    if (!data || typeof data !== 'object') return data;
    if (data.posts && typeof data.posts === 'object' && !Array.isArray(data.posts)) return data.posts;
    if (data.feed && typeof data.feed === 'object' && !Array.isArray(data.feed)) return data.feed;
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) return data.data;
    return data;
  }

  function nextCommunityPostsPath(data = {}) {
    const payload = postsPayloadFromCommunityData(data);
    return payload.next || payload.next_page || payload.links?.next || payload.pagination?.next || '';
  }

  async function hydrateAllCommunityPosts(data = {}) {
    const firstPayload = postsPayloadFromCommunityData(data);
    const allPosts = [...normalizeArray(firstPayload, 'results', 'items', 'posts', 'feed', 'data')];
    const seenPosts = new Set(allPosts.map((post) => String(post.id ?? post.pk ?? `${post.author?.nickname || ''}-${post.created_at || ''}-${post.content || ''}`)));
    const seenPages = new Set();
    let currentPath = nextPagePath(nextCommunityPostsPath(data), `/api/posts/communities/${currentSlug}/`);

    for (let page = 0; currentPath && page < 50; page += 1) {
      if (seenPages.has(currentPath)) break;
      seenPages.add(currentPath);

      const pageData = await apiJSON(currentPath);
      const pagePayload = postsPayloadFromCommunityData(pageData);
      normalizeArray(pagePayload, 'results', 'items', 'posts', 'feed', 'data').forEach((post) => {
        const key = String(post.id ?? post.pk ?? `${post.author?.nickname || ''}-${post.created_at || ''}-${post.content || ''}`);
        if (!seenPosts.has(key)) {
          seenPosts.add(key);
          allPosts.push(post);
        }
      });

      currentPath = nextPagePath(nextCommunityPostsPath(pageData), currentPath);
    }

    if (Array.isArray(data.posts)) return { ...data, posts: allPosts };
    if (data.posts && typeof data.posts === 'object') return { ...data, posts: { ...firstPayload, results: allPosts, items: allPosts, next: null } };
    if (data.feed && typeof data.feed === 'object') return { ...data, feed: { ...firstPayload, results: allPosts, items: allPosts, next: null }, posts: allPosts };
    if (data.data && typeof data.data === 'object') return { ...data, data: { ...firstPayload, results: allPosts, items: allPosts, next: null }, posts: allPosts };
    return { ...data, posts: allPosts };
  }

  function normalizeCommunityDetails(data = {}) {
    const community = normalizeCommunity(data.community || data, data.members_count);
    community.is_creator = Boolean(community.is_creator || data.is_creator);
    const members = normalizeArray(data.members, 'results').length
      ? normalizeArray(data.members, 'results')
      : normalizeArray(community.members, 'results');
    const posts = normalizeArray(postsPayloadFromCommunityData(data), 'results', 'items', 'posts', 'feed', 'data');
    const isMember = Boolean(data.is_member || community.is_member || community.member || community.is_creator || data.is_creator);
    return {
      community,
      members,
      posts,
      isMember,
      membersCount: getCommunityMemberCount(community, data.members_count || members.length),
    };
  }

  function communityPostSkeletonHTML() {
    return `
      <div class="post-card community-post-skeleton placeholder-glow" aria-hidden="true">
        <span class="placeholder community-skeleton-avatar-sm"></span>
        <span class="community-skeleton-post-body">
          <span class="placeholder community-skeleton-line community-skeleton-line-md"></span>
          <span class="placeholder community-skeleton-line community-skeleton-line-sm"></span>
          <span class="placeholder community-skeleton-line community-skeleton-line-lg"></span>
          <span class="placeholder community-skeleton-line community-skeleton-line-xl"></span>
        </span>
      </div>
    `;
  }

  function communityMemberSkeletonHTML() {
    return `
      <div class="member-item community-member-skeleton placeholder-glow" aria-hidden="true">
        <span class="placeholder community-skeleton-avatar-sm"></span>
        <span class="community-skeleton-member-lines">
          <span class="placeholder community-skeleton-line community-skeleton-line-md"></span>
          <span class="placeholder community-skeleton-line community-skeleton-line-sm"></span>
        </span>
      </div>
    `;
  }

  function renderCommunitySkeleton() {
    communityHero?.classList.add('community-hero-loading');
    communityHero?.setAttribute('aria-busy', 'true');

    if (commAvatar) {
      commAvatar.classList.remove('has-image', 'profile-skeleton-avatar', 'community-skeleton-avatar');
      commAvatar.classList.add('profile-skeleton-avatar', 'community-skeleton-avatar');
      commAvatar.innerHTML = '<span class="profile-skeleton-dot" aria-hidden="true"></span>';
    }

    if (commName) commName.innerHTML = '<span class="profile-skeleton-line community-skeleton-title" aria-hidden="true"></span>';
    if (commCreator) commCreator.innerHTML = '<span class="profile-skeleton-line community-skeleton-meta" aria-hidden="true"></span>';
    if (commMembersCount) commMembersCount.innerHTML = '<span class="profile-skeleton-line community-skeleton-meta-short" aria-hidden="true"></span>';
    if (commDesc) commDesc.innerHTML = '<span class="profile-skeleton-line community-skeleton-desc" aria-hidden="true"></span>';

    if (commActionBtn) commActionBtn.style.display = 'none';
    if (deleteCommunityBtn) deleteCommunityBtn.style.display = 'none';
    if (createPostCard) createPostCard.style.display = 'none';
    if (communitySidebarPostBtn) communitySidebarPostBtn.style.display = 'none';
    if (communityMobilePostFab) communityMobilePostFab.setAttribute("hidden", "");
    if (postsContainer) postsContainer.innerHTML = communityPostSkeletonHTML().repeat(2);
    if (membersContainer) membersContainer.innerHTML = communityMemberSkeletonHTML().repeat(4);
  }

  function clearCommunitySkeleton() {
    communityHero?.classList.remove('community-hero-loading');
    communityHero?.removeAttribute('aria-busy');
    commAvatar?.classList.remove('profile-skeleton-avatar', 'community-skeleton-avatar');
  }

  function renderCommunityAvatar(community = {}) {
    if (!commAvatar) return;
    commAvatar.classList.remove('has-image', 'profile-skeleton-avatar', 'community-skeleton-avatar');
    commAvatar.setAttribute('data-photo-viewer', 'community');
    commAvatar.dataset.photoTitle = community.name || 'Comunidade';

    if (communityPhoto(community)) {
      commAvatar.innerHTML = `<img src="${escapeHTML(toApiUrl(communityPhoto(community)))}" alt="Foto da comunidade ${escapeHTML(community.name)}">`;
      commAvatar.classList.add('has-image');
    } else {
      commAvatar.textContent = getInitials(community.name);
    }
  }

  function renderMembers(members = [], community = {}) {
    if (!membersContainer) return;
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

    const shown = sorted.slice(0, communityMembersVisible);

    membersContainer.innerHTML = shown.map((member) => {
      const memberUser = userProfileSource(member);
      const name = userDisplayName(memberUser);
      const nickname = memberUser.nickname || memberUser.username || 'usuario';

      return `
        <a href="${profileUrlFor(memberUser)}" class="side-community-item member-item">
          ${avatarHTML(memberUser, 'side-friend-avatar')}
          <div>
            <strong>${escapeHTML(name)}</strong>
            <span>@${escapeHTML(nickname)}</span>
          </div>
        </a>
      `;
    }).join('');

    if (sorted.length > shown.length) {
      membersContainer.insertAdjacentHTML('beforeend', '<button type="button" class="load-more-btn compact side-list-more-btn" id="communityMoreMembers">Ver mais</button>');
      document.getElementById('communityMoreMembers')?.addEventListener('click', () => {
        communityMembersVisible += SIDE_LIST_BATCH_SIZE;
        renderMembers(members, community);
      });
    }
  }

  function setActiveCommunityTab(mode) {
    currentPostMode = mode;
    communityGeneralTab?.classList.toggle('active', mode === 'general');
    communityFriendsTab?.classList.toggle('active', mode === 'friends');
  }

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
  
  function renderCommunityDetails(data) {
    const { community, members, posts, isMember, membersCount } = normalizeCommunityDetails(data);
    currentCommunity = community;
    currentSlug = community.slug || currentSlug;
    clearCommunitySkeleton();

    const creator = creatorFromCommunity(community);
    const isCreator = Boolean(community.is_creator || data.is_creator || isSameUser(creator, currentUser));
    const creatorName = userDisplayName(creator);
    const creatorNickname = creator.nickname || community.creator_nickname || '';

    if (commName) commName.textContent = community.name || 'Comunidade';
    if (commDesc) commDesc.textContent = community.description || 'Sem descrição.';
    if (commMembersCount) commMembersCount.textContent = `${membersCount} participante(s)`;
    if (commCreator) {
      commCreator.innerHTML = creatorNickname
        ? `Criada por ${userLinkHTML({ ...creator, nickname: creatorNickname }, `@${creatorNickname}`, 'nickname-link')}`
        : `Criada por ${escapeHTML(creatorName)}`;
    }

    renderCommunityAvatar(community);

    if (commActionBtn) {
      commActionBtn.style.display = 'inline-flex';
      if (isCreator) {
        commActionBtn.textContent = 'Editar comunidade';
        commActionBtn.className = 'btn btn-outline-primary';
        commActionBtn.onclick = openEditCommunityModal;
      } else if (isMember) {
        commActionBtn.textContent = 'Sair da comunidade';
        commActionBtn.className = 'btn btn-outline-danger';
        commActionBtn.onclick = async function() {
           window.travarBotao(this);
           await leaveCommunity();
           window.destravarBotao(this);
        };
      } else {
        commActionBtn.textContent = 'Participar';
        commActionBtn.className = 'btn btn-primary';
        commActionBtn.onclick = async function() {
           window.travarBotao(this);
           await joinCommunity();
           window.destravarBotao(this);
        };
      }
    }

    if (deleteCommunityBtn) {
      deleteCommunityBtn.style.display = isCreator ? 'inline-flex' : 'none';
    }

    if (createPostCard) {
      createPostCard.style.display = isMember ? 'grid' : 'none';
      createPostCard.setAttribute('aria-hidden', isMember ? 'false' : 'true');
    }

    if (communitySidebarPostBtn) {
      communitySidebarPostBtn.style.display = isMember ? 'inline-flex' : 'none';
    }
    
    if (communityMobilePostFab) {
  if (isMember) {
    communityMobilePostFab.removeAttribute("hidden");
    communityMobilePostFab.setAttribute("aria-hidden", "false");
  } else {
    communityMobilePostFab.setAttribute("hidden", "");
    communityMobilePostFab.setAttribute("aria-hidden", "true");
  }
}

    if (communityMobilePostFab) {
      communityMobilePostFab.style.display = isMember ? 'flex' : 'none';
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

  function renderPosts(posts = [], isMember) {
    if (!postsContainer) return;
    if (!posts.length) {
      postsContainer.innerHTML = currentPostMode === 'friends'
        ? '<div class="api-empty-state text-center">Nenhum post de amigos nesta comunidade ainda.</div>'
        : '<div class="api-empty-state text-center">Nenhum post nesta comunidade ainda.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => ConectaPosts.renderPostCard(post, {
      currentUser,
      showCommunityLabel: false,
      allowCommentInput: isMember,
      canInteract: isMember,
    })).join('') + '<footer class="feed-footer community-posts-end">Fim dos posts</footer>';

    if (highlightedPostId && window.ConectaPosts) ConectaPosts.openPostComments(highlightedPostId);
    scrollToHighlightedPost();
  }

async function loadCommunityDetails(silent = false) {
    const cacheKey = `@conecta:cache_community_${currentSlug}`;

    await window.useSWR(
      cacheKey,
      // 1. Fetcher: Procura os dados na API e faz o tratamento básico de erros
      async () => {
        const response = await apiFetch(`/api/posts/communities/${currentSlug}/`);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          if (commName) commName.textContent = 'Comunidade não encontrada';
          if (commDesc) commDesc.textContent = getApiError(data, 'Esta comunidade não existe ou foi excluída.');
          if (postsContainer) postsContainer.innerHTML = '';
          if (membersContainer) membersContainer.innerHTML = '';
          throw new Error('Comunidade não encontrada');
        }
        return await hydrateAllCommunityPosts(data);
      },
      // 2. Render: Atualiza o ecrã com as informações estruturadas
      (data) => {
        renderCommunityDetails(data || {});
      },
      // 3. Opções: Configuração de armazenamento e Skeletons
      {
        silent: silent,
        storage: 'session',
        onLoading: () => {
          if (!silent) renderCommunitySkeleton();
          else {
            if (postsContainer) postsContainer.innerHTML = communityPostSkeletonHTML().repeat(2);
            if (membersContainer) membersContainer.innerHTML = communityMemberSkeletonHTML().repeat(4);
          }
        },
        onError: (error, hasCache) => {
          if (!silent && !hasCache) {
            if (commDesc) commDesc.textContent = 'Erro ao conectar com o servidor.';
          }
        }
      }
    );
  }
  async function joinCommunity() {
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/join/`, { method: 'POST' });
    if (response.ok) await loadCommunityDetails(true);
  }

  async function leaveCommunity() {
    if (!confirm('Tem certeza que deseja sair desta comunidade?')) return;
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/leave/`, { method: 'POST' });
    if (response.ok) window.location.href = 'communities.html';
  }

  function openEditCommunityModal() {
    document.getElementById('editCommunityName').value = currentCommunity.name || '';
    document.getElementById('editCommunityBio').value = currentCommunity.description || '';
    document.getElementById('editCommunityError').style.display = 'none';

    if (commCropper) { commCropper.destroy(); commCropper = null; }
    document.getElementById('editCommPhotoInput').value = '';
    document.getElementById('commPhotoCropWrapper').classList.add('d-none');

    const previewImg = document.getElementById('editCommAvatarPreview');
    const photoUrl = toApiUrl(communityPhoto(currentCommunity));
    
    if (photoUrl) {
      previewImg.src = photoUrl;
      previewImg.style.display = 'block';
    } else {
      previewImg.style.display = 'none';
    }

    editCommunityModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editCommunityModal'));
    editCommunityModal.show();
  }

  document.getElementById('triggerCommPhotoInput')?.addEventListener('click', () => {
    document.getElementById('editCommPhotoInput').click();
  });

  document.getElementById('editCommPhotoInput')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    const wrapper = document.getElementById('commPhotoCropWrapper');
    const imageToCrop = document.getElementById('commPhotoToCrop');

    if (file) {
      const reader = new FileReader();
      reader.onload = function (event) {
        imageToCrop.src = event.target.result;
        wrapper.classList.remove('d-none');

        if (commCropper) commCropper.destroy();

        commCropper = new Cropper(imageToCrop, {
          aspectRatio: 1,
          viewMode: 1,
          autoCropArea: 0.8,
          dragMode: 'move',
        });
      };
      reader.readAsDataURL(file);
    }
  });

  saveCommunityBtn?.addEventListener('click', async () => {
    const name = document.getElementById('editCommunityName').value.trim();
    const description = document.getElementById('editCommunityBio').value.trim();
    const error = document.getElementById('editCommunityError');

    error.style.display = 'none';
    window.travarBotao(saveCommunityBtn, true);

    try {
      let response;

      if (commCropper) {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', description);
        
        await new Promise((resolve) => {
          const canvas = commCropper.getCroppedCanvas({ width: 400, height: 400, fillColor: '#fff' });
          canvas.toBlob((blob) => { 
            formData.append('photo', blob, 'comunidade.jpg'); 
            resolve(); 
          }, 'image/jpeg', 0.9);
        });

        response = await apiFetch(`/api/posts/communities/${currentSlug}/update/`, {
          method: 'PATCH',
          body: formData,
        });

      } else {
        response = await apiFetch(`/api/posts/communities/${currentSlug}/update/`, {
          method: 'PATCH',
          body: JSON.stringify({ name, description }),
        });
      }

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        error.textContent = getApiError(data, 'Erro ao editar comunidade.');
        error.style.display = 'block';
        return;
      }

      editCommunityModal.hide();
      if (data?.community?.slug && data.community.slug !== currentSlug) {
        window.history.replaceState({}, '', `community.html?slug=${encodeURIComponent(data.community.slug)}`);
        currentSlug = data.community.slug;
      }
      await loadCommunityDetails(true);
    } catch (err) {
      error.textContent = 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      window.destravarBotao(saveCommunityBtn, true);
    }
  });

  deleteCommunityBtn?.addEventListener('click', async function() {
    if (!confirm('Tem certeza que deseja excluir esta comunidade?')) return;
    window.travarBotao(this);
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/delete/`, { method: 'DELETE' });
    if (response.ok) {
      window.location.href = 'communities.html';
    } else {
      window.destravarBotao(this);
    }
  });

  async function createCommunityPost(content) {
    const payloadWithCommunity = buildCommunityPostPayload(content, currentCommunity || { slug: currentSlug });
    
    let response = await apiFetch(`/api/posts/communities/${currentSlug}/post/create/`, {
      method: 'POST',
      body: JSON.stringify(payloadWithCommunity),
    });
    
    if (!response.ok && response.status === 404) {
      response = await apiFetch('/api/posts/feed/create/', {
        method: 'POST',
        body: JSON.stringify(payloadWithCommunity),
      });
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(getApiError(data, 'Erro ao publicar.'));
    
    return { response, data };
  }

async function publishCommunityPost() {
    const contentEl = document.getElementById('communityPostContent');
    const error = document.getElementById('communityPostError');
    const content = contentEl.value.trim();

    error.style.display = 'none';
    if (!content) return;

    window.travarBotao(publishBtn, true);

    try {
      const { response, data } = await createCommunityPost(content);
      
      // Extraímos os dados ou usamos um fallback de segurança
      const novoPost = data?.post || data?.data || data || {};
      
      // 2. Hidratamos os dados do post que faltam
      novoPost.content = novoPost.content || content;
      novoPost.author = currentUser;
      novoPost.id = novoPost.id || Date.now();
      novoPost.created_at = novoPost.created_at || new Date().toISOString();
      
      // Como estamos dentro da página da comunidade, forçamos essa informação
      novoPost.community = currentCommunity;

      // Geramos o HTML do novo post
      const novoPostHTML = ConectaPosts.renderPostCard(novoPost, {
        currentUser,
        showCommunityLabel: false, // Oculta o selo "Feito em X" porque já estamos nela
        allowCommentInput: currentIsMember,
        canInteract: currentIsMember,
      });

      // Injetamos o post no topo
      const postsContainer = document.getElementById('community-posts-container');
      
      // Remove o texto de "Nenhum post ainda" se este for o primeiro post
      const emptyState = postsContainer.querySelector('.api-empty-state');
      if (emptyState) emptyState.remove();

      postsContainer.insertAdjacentHTML('afterbegin', novoPostHTML);

      contentEl.value = '';
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityPostModal')).hide();
      
      // REMOVIDO: await loadCommunityDetails(true);
    } catch (err) {
      console.error(err);
      error.textContent = err.message || 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      window.destravarBotao(publishBtn, true);
    }
  }

  publishBtn?.addEventListener('click', publishCommunityPost);

  createPostCard?.addEventListener('click', (event) => {
    if (!currentIsMember || event.target.closest('button')) return;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityPostModal')).show();
    setTimeout(() => document.getElementById('communityPostContent')?.focus(), 120);
  });

  createPostCard?.addEventListener('keydown', (event) => {
    if (!currentIsMember || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityPostModal')).show();
    setTimeout(() => document.getElementById('communityPostContent')?.focus(), 120);
  });

  document.getElementById('communityPostContent')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      publishCommunityPost();
    }
  });

  // Ações de Interação (Like, Comment, Edit)
  window.toggleLike = async (postId, btnElement = null) => {
    if (btnElement && !window.travarBotao(btnElement, false)) return;
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
      if (!response.ok) return;
      if (!btnElement) return loadCommunityDetails(true);
      const data = await response.json().catch(() => null);
      const svg = btnElement.querySelector('svg');
      btnElement.classList.toggle('text-primary-custom', !!data?.liked);
      if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
      btnElement.querySelector('.like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
    } finally {
      if (btnElement) window.destravarBotao(btnElement, false);
    }
  };

  window.addComment = async (postId) => {
    window.openPostCommentBox(null, postId);
  };

  window.toggleCommentLike = async (commentId, btnElement = null) => {
    if (btnElement && !window.travarBotao(btnElement, false)) return;
    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/like/`, { method: 'POST' });
      if (!response.ok) return;
      if (!btnElement) return loadCommunityDetails(true);
      const data = await response.json().catch(() => null);
      const svg = btnElement.querySelector('svg');
      btnElement.classList.toggle('text-primary-custom', !!data?.liked);
      if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
      btnElement.querySelector('.comment-like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
    } finally {
      if (btnElement) window.destravarBotao(btnElement, false);
    }
  };

  window.deletePost = async (postId, btnElement) => {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    if (btnElement) window.travarBotao(btnElement);
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/delete/`, { method: 'DELETE' });
      if (response.ok) {
        const postCard = document.getElementById(`post-${postId}`);
        if (postCard) {
          // Efeito visual suave antes de remover da tela, fica bunitao
          postCard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          postCard.style.opacity = '0';
          postCard.style.transform = 'scale(0.95)';
          setTimeout(() => postCard.remove(), 300);
        }
      } else {
        alert('Erro ao excluir o post da comunidade.');
      }
    } finally {
      if (btnElement) window.destravarBotao(btnElement);
    }
  };

  window.enablePostEdit = (postId) => {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    if (!contentDiv) return;
    const originalText = contentDiv.querySelector('.post-text')?.textContent || contentDiv.dataset.raw || '';
    contentDiv.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="280"></textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" type="button" onclick="savePostEdit(${postId}, this)">Salvar</button>
          <button class="btn btn-sm btn-secondary" type="button" onclick="loadCommunityDetailsFromButton()">Cancelar</button>
        </div>
      </div>`;
    document.getElementById(`edit-post-input-${postId}`).value = originalText;
  };

  window.savePostEdit = async (postId, btnElement) => {
    const content = document.getElementById(`edit-post-input-${postId}`)?.value.trim();
    if (!content) return;
    if (btnElement) window.travarBotao(btnElement, true);
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      if (response.ok) await loadCommunityDetails(true);
    } finally {
      if (btnElement) window.destravarBotao(btnElement, true);
    }
  };

  window.enablePostEdit = (postId) => {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    if (!contentDiv) return;
    const originalText = contentDiv.querySelector('.post-text')?.textContent || contentDiv.dataset.raw || '';
    
    // Armazena o texto com segurança antes de trocar pelo formulário
    contentDiv.setAttribute('data-raw', originalText);
    
    contentDiv.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="280"></textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" type="button" onclick="savePostEdit(${postId}, this)">Salvar</button>
          <button class="btn btn-sm btn-secondary" type="button" onclick="cancelPostEdit(${postId})">Cancelar</button>
        </div>
      </div>`;
    document.getElementById(`edit-post-input-${postId}`).value = originalText;
  };

  // Função nova para não recarregar a página da comunidade ao desistir
  window.cancelPostEdit = (postId) => {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    if (!contentDiv) return;
    
    const originalText = contentDiv.getAttribute('data-raw') || '';
    contentDiv.innerHTML = `<p class="post-text">${escapeHTML(originalText)}</p>`;
  };

  window.savePostEdit = async (postId, btnElement) => {
    const content = document.getElementById(`edit-post-input-${postId}`)?.value.trim();
    if (!content) return;
    if (btnElement) window.travarBotao(btnElement, true);
    
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      if (response.ok) {
        const contentDiv = document.getElementById(`post-text-content-${postId}`);
        if (contentDiv) {
          contentDiv.setAttribute('data-raw', content);
          contentDiv.innerHTML = `<p class="post-text">${escapeHTML(content)}</p>`;
          
          // Adiciona o selinho de editado se não tiver
          const headerMain = document.querySelector(`#post-${postId} .post-header-main`);
          if (headerMain && !headerMain.querySelector('.post-edited-label')) {
            headerMain.insertAdjacentHTML('beforeend', '<small class="post-edited-label"> · editado</small>');
          }
        }
      } else {
        alert('Não foi possível salvar a edição.');
      }
    } finally {
      if (btnElement) window.destravarBotao(btnElement, true);
    }
  };

  window.toggleReplyInput = (commentId) => {
    const box = document.getElementById(`reply-box-${commentId}`);
    box?.classList.toggle('d-none');
    if (box && !box.classList.contains('d-none')) document.getElementById(`reply-input-${commentId}`)?.focus();
  };

  window.addReply = async (commentId, btnElement) => {
    const input = document.getElementById(`reply-input-${commentId}`);
    const content = input?.value.trim();
    if (!content) return;
    if (btnElement) window.travarBotao(btnElement, true);
    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/reply/`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      if (response.ok) await loadCommunityDetails(true);
      else alert('Erro ao responder.');
    } finally {
      if (btnElement) window.destravarBotao(btnElement, true);
    }
  };

  window.loadCommunityDetailsFromButton = () => loadCommunityDetails(true);

  communityGeneralTab?.addEventListener('click', () => {
    setActiveCommunityTab('general');
    renderVisibleCommunityPosts();
  });

  communityFriendsTab?.addEventListener('click', () => {
    setActiveCommunityTab('friends');
    renderVisibleCommunityPosts();
  });

  const refreshCommBtn = document.getElementById('refreshCommunityBtn');
  if (refreshCommBtn) {
    refreshCommBtn.addEventListener('click', async () => {
      const icon = refreshCommBtn.querySelector('.refresh-icon');
      if (icon) icon.classList.add('spin-animation');
      refreshCommBtn.disabled = true;
      await loadCommunityDetails(true);
      if (icon) icon.classList.remove('spin-animation');
      refreshCommBtn.disabled = false;
    });
  }

  renderCommunitySkeleton();

  try {
    currentUser = await loadLoggedUser();
    if (window.ConectaPosts) {
      ConectaPosts.currentUser = currentUser;
      ConectaPosts.currentUserNickname = currentUser?.nickname || '';
    }
  } catch (error) {
    console.error(error);
  }

  await loadCommunityDetails();
});