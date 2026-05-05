/* =========================================================
   Perfil público: mesmo layout do perfil próprio
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
    communities: [],
    friends: [],
  };

  function mergeCommunities(user = {}) {
    const created = normalizeArray(user.created_communities, 'results').map((community) => ({ ...community, __created: true }));
    const joined = normalizeArray(user.joined_communities, 'results').map((community) => ({ ...community, __created: Boolean(community.is_creator) }));

    return created.concat(joined)
      .filter((community, index, list) => list.findIndex((item) => item.slug === community.slug) === index)
      .map(normalizeCommunity)
      .sort((a, b) => Number(Boolean(b.__created || b.is_creator)) - Number(Boolean(a.__created || a.is_creator)) || getCommunityMemberCount(b) - getCommunityMemberCount(a));
  }

  function renderAvatar(user = {}) {
    const name = userDisplayName(user);
    avatar.classList.remove('has-image');
    avatar.setAttribute('data-photo-viewer', 'public-profile');
    avatar.dataset.photoTitle = name;

    if (userPhoto(user)) {
      avatar.innerHTML = `<img src="${escapeHTML(toApiUrl(userPhoto(user)))}" alt="Foto de ${escapeHTML(name)}">`;
      avatar.classList.add('has-image');
    } else {
      avatar.textContent = getInitials(name);
    }
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
            <span>${getCommunityMemberCount(comm)} participante(s)${isCreated ? ` · criada por @${escapeHTML(publicUser.nickname)}` : ''}</span>
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
      friendsContainer.innerHTML = '<div class="api-empty-state">Nenhuma amizade visível.</div>';
      return;
    }

    const shown = friends.slice(0, state.friendsVisible);
    friendsContainer.innerHTML = shown.map((friend) => `
      <a href="${profileUrlFor(friend)}" class="side-community-item">
        ${avatarHTML(friend, 'side-community-avatar')}
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

  function renderPosts(posts = []) {
    if (!posts.length) {
      postsContainer.innerHTML = '<div class="api-empty-state">Nenhuma publicação ainda.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => {
      const when = relativeTime(post.created_at, 'feito');
      const communityLabel = ConectaPosts?.renderCommunityChip ? ConectaPosts.renderCommunityChip(post) : '';
      const destination = postDestinationUrl(post);

      return `
        <article class="post-card profile-post-item clickable-post" data-post-url="${escapeHTML(destination)}">
          <a href="${profileUrlFor(publicUser)}" class="avatar-link" onclick="event.stopPropagation()">${avatarHTML(publicUser)}</a>
          <div class="post-body">
            <div class="post-header">
              <div>
                <strong class="post-author">${escapeHTML(userDisplayName(publicUser))}</strong>
                <span class="post-username">@${escapeHTML(publicUser.nickname || 'usuario')}</span>
                ${when ? `<span> · ${escapeHTML(when)}</span>` : ''}
              </div>
            </div>
            ${communityLabel}
            <p class="post-text">${escapeHTML(post.content)}</p>
            <div class="post-actions post-summary-actions">
              <span class="post-summary-metric">♡ ${postLikesCount(post)}</span>
              <span class="post-summary-metric">▱ ${postCommentsCount(post)}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function configureFriendButton(user) {
    actionBtn.style.display = 'inline-block';
    actionBtn.disabled = false;

    if (user.friendship_status === 'self') {
      actionBtn.textContent = 'Meu perfil';
      actionBtn.className = 'btn btn-outline-primary fw-bold';
      actionBtn.onclick = () => window.location.href = 'profile.html';
      return;
    }

    if (user.friendship_status === 'friends') {
      actionBtn.textContent = 'Remover amizade';
      actionBtn.className = 'btn btn-outline-danger fw-bold';
      actionBtn.onclick = async () => {
        if (!confirm(`Remover @${user.nickname} dos seus amigos?`)) return;
        const response = await apiFetch(`/api/users/friend/${user.nickname}/remove/`, { method: 'POST' });
        if (response.ok) loadPublicProfile();
      };
      return;
    }

    if (user.friendship_status === 'request_sent') {
      actionBtn.textContent = 'Cancelar pedido';
      actionBtn.className = 'btn btn-outline-secondary fw-bold';
      actionBtn.onclick = async () => {
        const response = await apiFetch(`/api/users/friend-request/${user.nickname}/cancel/`, { method: 'POST' });
        if (response.ok) loadPublicProfile();
      };
      return;
    }

    if (user.friendship_status === 'request_received') {
      actionBtn.textContent = 'Aceitar amizade';
      actionBtn.className = 'btn btn-primary fw-bold';
      actionBtn.onclick = async () => {
        const response = await apiFetch(`/api/users/friend-request/${user.nickname}/accept/`, { method: 'POST' });
        if (response.ok) loadPublicProfile();
      };
      return;
    }

    actionBtn.textContent = 'Adicionar amigo';
    actionBtn.className = 'btn btn-primary fw-bold';
    actionBtn.onclick = async () => {
      const response = await apiFetch(`/api/users/friend-request/${user.nickname}/send/`, { method: 'POST' });
      if (response.ok) loadPublicProfile();
    };
  }

  function renderProfile(user) {
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
    state.friends = normalizeArray(user.friends || user.friends_list, 'results');
    renderCommunities();
    renderFriends();
    renderPosts(posts);
  }

  async function loadPublicProfile() {
    try {
      const response = await apiFetch(`/api/users/profile/${nickname}/`);
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

      renderProfile(data);
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
