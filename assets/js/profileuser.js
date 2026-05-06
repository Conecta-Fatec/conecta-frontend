/* =========================================================
   Perfil público: cabeçalho, listas limitadas e posts resumo
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

  const staticAvatarClasses = [
    'static-avatar-blue',
    'static-avatar-green',
    'static-avatar-purple',
    'static-avatar-orange',
    'static-avatar-red',
    'static-avatar-indigo',
    'static-avatar-teal',
    'static-avatar-pink',
    'static-avatar-gray',
    'static-avatar-yellow',
    'static-avatar-brown',
    'user-avatar-alt',
  ];

  function clearStaticAvatarClasses(element) {
    if (!element) return;
    element.classList.remove(...staticAvatarClasses);
  }

  function profileUserAvatarHTML(user = {}, classes = 'user-avatar') {
    const name = userDisplayName(user);
    const photo = toApiUrl(userPhoto(user));

    if (photo) {
      return `
        <div class="${escapeHTML(classes)} has-image">
          <img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}">
        </div>
      `;
    }

    return `
      <div class="${escapeHTML(classes)}">
        ${escapeHTML(getInitials(name))}
      </div>
    `;
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
      avatar.innerHTML = `<img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}">`;
      avatar.classList.add('has-image');
      return;
    }

    avatar.innerHTML = escapeHTML(getInitials(name));
  }

  function renderCommunities() {
    const communities = state.communities;

    if (!communities.length) {
      communitiesContainer.innerHTML = '<div class="api-empty-state">Nenhuma comunidade.</div>';
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
      communitiesContainer.insertAdjacentHTML(
        'beforeend',
        '<button type="button" class="load-more-btn compact" id="publicMoreCommunities">Ver mais</button>'
      );

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
      friendsContainer.innerHTML = '<div class="api-empty-state">Nenhuma amizade visível.</div>';
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
      friendsContainer.insertAdjacentHTML(
        'beforeend',
        '<button type="button" class="load-more-btn compact" id="publicMoreFriends">Ver mais</button>'
      );

      document.getElementById('publicMoreFriends').addEventListener('click', () => {
        state.friendsVisible += 3;
        renderFriends();
      });
    }
  }

  function getPostCommunityInfo(post = {}) {
    const rawCommunity = post.community || post.community_data || post.group || null;
    const isObject = rawCommunity && typeof rawCommunity === 'object';

    const name =
      post.community_name ||
      post.community_title ||
      post.community_display_name ||
      (isObject ? rawCommunity.name || rawCommunity.title : '') ||
      (typeof rawCommunity === 'string' ? rawCommunity : '');

    const slug =
      post.community_slug ||
      post.community_id ||
      (isObject ? rawCommunity.slug || rawCommunity.id : '');

    return { name, slug };
  }

  function renderPostSource(post = {}) {
    const community = getPostCommunityInfo(post);

    if (community.name) {
      if (community.slug) {
        return `
          <a href="community.html?slug=${encodeURIComponent(community.slug)}"
             class="profile-post-source"
             onclick="event.stopPropagation()">
            Feito em ${escapeHTML(community.name)}
          </a>
        `;
      }

      return `<span class="profile-post-source">Feito em ${escapeHTML(community.name)}</span>`;
    }

    return `
      <a href="feed.html"
         class="profile-post-source"
         onclick="event.stopPropagation()">
        Feito no feed
      </a>
    `;
  }

  function renderPosts() {
    const posts = state.posts;

    if (!posts.length) {
      postsContainer.innerHTML = '<div class="api-empty-state">Nenhuma publicação ainda.</div>';
      return;
    }

    const shown = posts.slice(0, state.postsVisible);

    postsContainer.innerHTML = shown.map((post) => {
      const when = post.created_at ? relativeTime(post.created_at, 'feito') : '';
      const destination = postDestinationUrl(post);
      const source = renderPostSource(post);

      return `
        <article class="post-card profile-post-item clickable-post" data-post-url="${escapeHTML(destination)}">
          <a href="${profileUrlFor(publicUser)}" class="avatar-link" onclick="event.stopPropagation()">
            ${profileUserAvatarHTML(publicUser, 'user-avatar')}
          </a>

          <div class="post-body">
            <div class="post-header">
              <div>
                <strong class="post-author">${escapeHTML(userDisplayName(publicUser))}</strong>
                <span class="post-username">@${escapeHTML(publicUser.nickname || 'usuario')}</span>
                ${when ? `<span> · ${escapeHTML(when)}</span>` : ''}
              </div>
            </div>

            <p class="post-text">${escapeHTML(post.content)}</p>
            ${source}
          </div>
        </article>
      `;
    }).join('');

    if (posts.length > shown.length) {
      postsContainer.insertAdjacentHTML(
        'beforeend',
        '<div class="profile-posts-footer"><button type="button" class="load-more-btn compact" id="publicMorePosts">Ver mais</button></div>'
      );

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

    for (const endpoint of possibleEndpoints) {
      try {
        const data = await apiJSON(endpoint);
        const loadedFriends = normalizeArray(data, 'friends', 'results', 'users');

        if (loadedFriends.length) {
          state.friends = loadedFriends;
          renderFriends();
          return;
        }
      } catch (error) {
        console.warn(`Endpoint de amizades indisponível: ${endpoint}`, error);
      }
    }

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

        const response = await apiFetch(`/api/users/friend/${user.nickname}/remove/`, {
          method: 'POST',
        });

        if (response.ok) loadPublicProfile();
      };
      return;
    }

    if (user.friendship_status === 'request_sent') {
      actionBtn.textContent = 'Cancelar pedido';
      actionBtn.className = 'btn btn-outline-secondary';
      actionBtn.onclick = async () => {
        const response = await apiFetch(`/api/users/friend-request/${user.nickname}/cancel/`, {
          method: 'POST',
        });

        if (response.ok) loadPublicProfile();
      };
      return;
    }

    if (user.friendship_status === 'request_received') {
      actionBtn.textContent = 'Aceitar amizade';
      actionBtn.className = 'btn btn-primary';
      actionBtn.onclick = async () => {
        const response = await apiFetch(`/api/users/friend-request/${user.nickname}/accept/`, {
          method: 'POST',
        });

        if (response.ok) loadPublicProfile();
      };
      return;
    }

    actionBtn.textContent = 'Adicionar amigo';
    actionBtn.className = 'btn btn-primary';
    actionBtn.onclick = async () => {
      const response = await apiFetch(`/api/users/friend-request/${user.nickname}/send/`, {
        method: 'POST',
      });

      if (response.ok) loadPublicProfile();
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

  async function loadPublicProfile() {
    try {
      const response = await apiFetch(`/api/users/profile/${encodeURIComponent(nickname)}/`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        nameEl.textContent = 'Perfil não encontrado';
        bioEl.textContent = getApiError(data, 'Este usuário não existe.');
        postsContainer.innerHTML = '';
        communitiesContainer.innerHTML = '';
        friendsContainer.innerHTML = '';
        actionBtn.style.display = 'none';
        return;
      }

      await renderProfile(data);
    } catch (error) {
      console.error(error);
      bioEl.textContent = 'Erro ao conectar com o servidor.';
    }
  }

  postsContainer.addEventListener('click', (event) => {
    const card = event.target.closest('[data-post-url]');

    if (!card || event.target.closest('a,button')) return;

    window.location.href = card.dataset.postUrl;
  });

  await loadPublicProfile();
});
