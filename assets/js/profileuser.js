/* =========================================================
   Perfil público: cabeçalho, listas e posts 
   - OTIMIZADO COM SKELETON LOADER E ESTADOS MODERNOS
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  await loadLoggedUser();

  const params = new URLSearchParams(window.location.search);
  const nickname = params.get('nickname');

  if (!nickname) {
    window.location.href = 'friends.html';
    return;
  }

  let publicUser = null;

  const avatar = document.getElementById('public-avatar');
  const nameEl = document.getElementById('public-name');
  const bioEl = document.getElementById('public-bio');
  const nicknameEl = document.getElementById('public-nickname');
  const courseEl = document.getElementById('public-course');
  const friendsCountEl = document.getElementById('public-friends-count');
  const postsCountEl = document.getElementById('public-posts-count');
  const actionBtn = document.getElementById('friendActionBtn');
  const postsContainer = document.getElementById('public-posts-container');
  const communitiesContainer = document.getElementById('public-communities-container');
  const friendsContainer = document.getElementById('public-friends-container');

  const state = {
    communitiesVisible: 3,
    friendsVisible: 3,
    postsVisible: 5,
    postsBatchSize: 5,
    communities: [],
    friends: [],
    posts: [],
  };

  const modernEmptyState = (text, icon) => `
    <div class="api-empty-state text-center py-4" style="border: 1px dashed var(--line-color); background: transparent;">
      <span class="d-block fs-2 mb-2 opacity-75">${icon}</span>
      <span class="text-muted fw-medium">${text}</span>
    </div>
  `;

  function clearStaticAvatarClasses(element) {
    if (!element) return;
    const staticAvatarClasses = ['static-avatar-blue', 'static-avatar-green', 'static-avatar-purple', 'static-avatar-orange', 'static-avatar-red', 'static-avatar-indigo', 'static-avatar-teal', 'static-avatar-pink', 'static-avatar-gray', 'static-avatar-yellow', 'static-avatar-brown', 'user-avatar-alt'];
    element.classList.remove(...staticAvatarClasses);
  }

  function profileUserAvatarHTML(user = {}, classes = 'user-avatar') {
    const name = userDisplayName(user);
    const photo = cachedImageUrl(toApiUrl(userPhoto(user)));

    if (photo) {
      return `<div class="${escapeHTML(classes)} has-image"><img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}" loading="lazy" decoding="async"></div>`;
    }
    return `<div class="${escapeHTML(classes)}">${escapeHTML(getInitials(name))}</div>`;
  }

  function mergeCommunities(user = {}) {
    const created = normalizeArray(user.created_communities, 'results')
      .map((community) => ({ ...community, __created: true }));

    const joined = normalizeArray(user.joined_communities, 'results')
      .map((community) => ({ ...community, __created: Boolean(community.is_creator) }));

    return created.concat(joined)
      .filter((community, index, list) => list.findIndex((item) => item.slug === community.slug) === index)
      .map((community) => ({
        ...normalizeCommunity(community),
        __created: Boolean(community.__created || community.is_creator),
      }))
      .sort((a, b) => Number(Boolean(b.__created || b.is_creator)) - Number(Boolean(a.__created || a.is_creator)) || getCommunityMemberCount(b) - getCommunityMemberCount(a));
  }

  function renderAvatar(user = {}) {
    const name = userDisplayName(user);
    const photo = toApiUrl(userPhoto(user));

    avatar.classList.remove('has-image');
    clearStaticAvatarClasses(avatar);
    avatar.setAttribute('data-photo-viewer', 'public-profile');
    avatar.dataset.photoTitle = name;

    if (photo) {
      avatar.innerHTML = `<img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}" loading="lazy" decoding="async">`;
      avatar.classList.add('has-image');
      return;
    }

    avatar.innerHTML = escapeHTML(getInitials(name));
  }

  function renderCommunities() {
    const communities = state.communities;

    if (!communities.length) {
      communitiesContainer.innerHTML = modernEmptyState('Nenhuma comunidade.', '🏢');
      return;
    }

    const shown = communities.slice(0, state.communitiesVisible);

    communitiesContainer.innerHTML = shown.map((community) => {
      const comm = normalizeCommunity(community);
      const isCreated = Boolean(community.__created || community.is_creator);

      return `
        <a href="community.html?slug=${encodeURIComponent(comm.slug)}" class="side-community-item">
          ${communityAvatarHTML(comm, 'side-community-avatar')}
          <div>
            <strong>${escapeHTML(comm.name)}</strong>
            <span>${getCommunityMemberCount(comm)} participante(s)${isCreated ? ' · criador' : ''}</span>
          </div>
        </a>
      `;
    }).join('');

    if (communities.length > shown.length) {
      communitiesContainer.insertAdjacentHTML('beforeend', '<button type="button" class="load-more-btn compact" id="publicMoreCommunities">Ver mais</button>');
      document.getElementById('publicMoreCommunities').addEventListener('click', () => {
        state.communitiesVisible += 3;
        renderCommunities();
      });
    }
  }

  function renderFriends() {
    const friends = state.friends;

    if (!friendsContainer) return;

    if (!friends.length) {
      friendsContainer.innerHTML = modernEmptyState('Nenhuma amizade visível.', '🤝');
      return;
    }

    const shown = friends.slice(0, state.friendsVisible);

    friendsContainer.innerHTML = shown.map((friend) => `
      <a href="${profileUrlFor(friend)}" class="side-friend-item">
        ${profileUserAvatarHTML(friend, 'user-avatar side-friend-avatar')}
        <div>
          <strong>${escapeHTML(userDisplayName(friend))}</strong>
          <span>@${escapeHTML(friend.nickname || 'usuario')}</span>
        </div>
      </a>
    `).join('');

    if (friends.length > shown.length) {
      friendsContainer.insertAdjacentHTML('beforeend', '<button type="button" class="load-more-btn compact" id="publicMoreFriends">Ver mais</button>');
      document.getElementById('publicMoreFriends').addEventListener('click', () => {
        state.friendsVisible += 3;
        renderFriends();
      });
    }
  }

  function renderPosts() {
    const posts = state.posts;

    if (!posts.length) {
      postsContainer.innerHTML = modernEmptyState('Nenhuma publicação feita.', '📝');
      return;
    }

    const shown = posts.slice(0, state.postsVisible);

    postsContainer.innerHTML = shown.map((post) => {
      if (window.ConectaPosts && window.ConectaPosts.postCache) {
         window.ConectaPosts.postCache.set(String(post.id), post);
      }

      const destination = postDestinationUrl(post);
      const community = post.community || post.community_data || post.group || null;
      const commName = post.community_name || (community && typeof community === 'object' ? community.name : '');
      const source = commName 
        ? `<a href="community.html?slug=${encodeURIComponent(post.community_slug || community.slug)}" class="profile-post-source" onclick="event.stopPropagation()">Feito em ${escapeHTML(commName)}</a>`
        : `<a href="feed.html" class="profile-post-source" onclick="event.stopPropagation()">Feito no feed</a>`;
      
      const fullName = userDisplayName(publicUser);
      const fullNick = publicUser.nickname || 'usuario';

      return `
        <article class="post-card profile-post-item clickable-post post-card-clickable" id="post-${post.id}" data-post-url="${escapeHTML(destination)}" data-can-interact="false">
          <a href="${profileUrlFor(publicUser)}" class="avatar-link" onclick="event.stopPropagation()">
            ${profileUserAvatarHTML(publicUser, 'user-avatar')}
          </a>

          <div class="post-body">
            <div class="post-header">
              <div class="post-header-main">
                <strong class="post-author">${escapeHTML(truncateText(fullName, 20))}</strong>
                <span class="post-username">@${escapeHTML(truncateText(fullNick, 20))}</span>
              </div>
            </div>

            <p class="post-text">${escapeHTML(post.content)}</p>
            ${source}
            <div class="inline-comments-placeholder" id="inline-comments-${post.id}"></div>
          </div>
        </article>
      `;
    }).join('');

    if (posts.length > shown.length) {
      postsContainer.insertAdjacentHTML('beforeend', '<div class="profile-posts-footer"><button type="button" class="load-more-btn compact" id="publicMorePosts">Ver mais</button></div>');
      document.getElementById('publicMorePosts').addEventListener('click', () => {
        state.postsVisible += state.postsBatchSize;
        renderPosts();
      });
      return;
    }

    postsContainer.insertAdjacentHTML('beforeend', '<div class="feed-footer profile-posts-end">Fim dos posts</div>');
  }

  async function loadPublicFriends(user) {
    let friends = normalizeArray(user.friends || user.friends_list, 'friends', 'results');

    if (friends.length || Number(user.friends_count || 0) === 0) {
      state.friends = friends;
      renderFriends();
      return;
    }

    const userNickname = encodeURIComponent(user.nickname || nickname);

    const possibleEndpoints = [
      `/api/users/profile/${userNickname}/friends/`,
      `/api/users/${userNickname}/friends/`,
      `/api/users/friends/${userNickname}/`,
    ];

    const fetchPromises = possibleEndpoints.map(ep => 
        apiFetch(ep).then(res => {
            if (res.ok) return res.json();
            throw new Error('404');
        })
    );

    try {
        const data = await Promise.any(fetchPromises);
        const loadedFriends = normalizeArray(data, 'friends', 'results', 'users');

        if (loadedFriends.length) {
          state.friends = loadedFriends;
          renderFriends();
          return;
        }
    } catch (error) {}

    state.friends = friends;
    renderFriends();
  }

  function configureFriendButton(user) {
    actionBtn.style.display = 'inline-block';
    actionBtn.disabled = false;

    if (user.friendship_status === 'self') {
      actionBtn.textContent = 'Meu perfil';
      actionBtn.className = 'btn btn-outline-primary';
      actionBtn.onclick = () => window.location.href = 'profile.html';
      return;
    }

    if (user.friendship_status === 'friends') {
      actionBtn.textContent = 'Remover amizade';
      actionBtn.className = 'btn btn-outline-danger';
      actionBtn.onclick = async () => {
        if (!confirm(`Remover @${user.nickname} dos seus amigos?`)) return;
        window.travarBotao(actionBtn, true);
        actionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Removendo...';
        const response = await apiFetch(`/api/users/friend/${user.nickname}/remove/`, { method: 'POST' });
        if (response.ok) loadPublicProfile(true);
        else window.destravarBotao(actionBtn, true);
      };
      return;
    }

    if (user.friendship_status === 'request_sent') {
      actionBtn.textContent = 'Cancelar pedido';
      actionBtn.className = 'btn btn-outline-secondary';
      actionBtn.onclick = async () => {
        window.travarBotao(actionBtn, true);
        actionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Cancelando...';
        const response = await apiFetch(`/api/users/friend-request/${user.nickname}/cancel/`, { method: 'POST' });
        if (response.ok) loadPublicProfile(true);
        else window.destravarBotao(actionBtn, true);
      };
      return;
    }

    if (user.friendship_status === 'request_received') {
      actionBtn.textContent = 'Aceitar amizade';
      actionBtn.className = 'btn btn-primary';
      actionBtn.onclick = async () => {
        window.travarBotao(actionBtn, true);
        actionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Aceitando...';
        const response = await apiFetch(`/api/users/friend-request/${user.nickname}/accept/`, { method: 'POST' });
        if (response.ok) loadPublicProfile(true);
        else window.destravarBotao(actionBtn, true);
      };
      return;
    }

    actionBtn.textContent = 'Adicionar amigo';
    actionBtn.className = 'btn btn-primary';
    actionBtn.onclick = async () => {
      window.travarBotao(actionBtn, true);
      actionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enviando...';
      const response = await apiFetch(`/api/users/friend-request/${user.nickname}/send/`, { method: 'POST' });
      if (response.ok) loadPublicProfile(true);
      else window.destravarBotao(actionBtn, true);
    };
  }

  async function renderProfile(user) {
    publicUser = user;

    const posts = normalizeArray(user.posts, 'results');
    const name = userDisplayName(user);

    renderAvatar(user);

    nameEl.textContent = name;
    nicknameEl.textContent = `@${user.nickname || 'usuario'}`;
    friendsCountEl.textContent = `${user.friends_count || 0} amigo(s)`;
    postsCountEl.textContent = `${user.posts_count ?? posts.length} post(s)`;
    courseEl.textContent = user.course || 'Curso não informado';
    bioEl.textContent = user.bio || 'Sem bio.';

    configureFriendButton(user);

    state.communities = mergeCommunities(user);
    state.posts = posts;
    state.postsVisible = state.postsBatchSize;

    renderCommunities();
    renderPosts();
    await loadPublicFriends(user);
  }

  async function loadPublicProfile(silent = false) {
    const cacheKey = `@conecta:cache_profileuser_${nickname}`;

    try {
      const cacheSalvo = sessionStorage.getItem(cacheKey);
      if (cacheSalvo && !silent) {
        await renderProfile(JSON.parse(cacheSalvo));
        silent = true;
      }

      if (!silent) {
        const skeletonPost = `
          <div class="post-card placeholder-glow" style="border: 1px solid var(--border-color); background: var(--post-surface); padding: 1.15rem; border-radius: 1.25rem; display: flex; gap: 1rem; width: 100%;">
            <div class="placeholder rounded-circle" style="width: 50px; height: 50px; background-color: var(--line-color); flex-shrink: 0;"></div>
            <div class="w-100 mt-1">
              <div class="placeholder rounded w-50 mb-2" style="height: 14px; background-color: var(--line-color);"></div>
              <div class="placeholder rounded w-25 mb-4" style="height: 12px; background-color: var(--line-color);"></div>
              <div class="placeholder rounded w-100 mb-2" style="height: 16px; background-color: var(--line-color);"></div>
            </div>
          </div>`;
        const skeletonSideItem = `
          <div class="side-community-item placeholder-glow" style="display: flex; align-items: center; gap: 0.85rem; padding: 0.82rem 0; width: 100%; border-bottom: 1px solid var(--line-color);">
            <div class="placeholder rounded-circle" style="width: 3.55rem; height: 3.55rem; background-color: var(--line-color); flex-shrink: 0;"></div>
            <div class="w-100 mt-1">
              <div class="placeholder rounded w-75 mb-2" style="height: 14px; background-color: var(--line-color);"></div>
              <div class="placeholder rounded w-50" style="height: 12px; background-color: var(--line-color);"></div>
            </div>
          </div>`;

        if (postsContainer) postsContainer.innerHTML = skeletonPost + skeletonPost;
        if (communitiesContainer) communitiesContainer.innerHTML = skeletonSideItem + skeletonSideItem;
        if (friendsContainer) friendsContainer.innerHTML = skeletonSideItem + skeletonSideItem;
      }

      const response = await apiFetch(`/api/users/profile/${encodeURIComponent(nickname)}/`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        nameEl.textContent = 'Perfil não encontrado';
        bioEl.innerHTML = '<span class="text-danger">Este usuário não existe.</span>';
        postsContainer.innerHTML = '';
        communitiesContainer.innerHTML = '';
        friendsContainer.innerHTML = '';
        actionBtn.style.display = 'none';
        return;
      }

      if (JSON.stringify(data) !== cacheSalvo) {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
        await renderProfile(data);
      }

    } catch (error) {
      console.error(error);
      if (!silent) bioEl.innerHTML = '<span class="text-danger">Erro de conexão.</span>';
    }
  }

  postsContainer.addEventListener('click', (event) => {
    const card = event.target.closest('[data-post-url]');
    if (!card || event.target.closest('a,button')) return;

    if (window.ConectaPosts?.handlePostCardClick && card.id?.startsWith('post-')) {
      window.ConectaPosts.handlePostCardClick(event, card.id.replace('post-', ''));
      return;
    }
    window.location.href = card.dataset.postUrl;
  });

  await loadPublicProfile();
});