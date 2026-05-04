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
  const actionBtn = document.getElementById('friendActionBtn');
  const postsContainer = document.getElementById('public-posts-container');
  const createdContainer = document.getElementById('public-created-communities');
  const joinedContainer = document.getElementById('public-joined-communities');

  function renderCommunities(container, communities) {
    if (!communities || communities.length === 0) {
      container.innerHTML = '<div class="api-empty-state">Nenhuma comunidade.</div>';
      return;
    }

    container.innerHTML = communities.map((community) => {
      const comm = normalizeCommunity(community);
      return `
        <a href="community.html?slug=${encodeURIComponent(comm.slug)}" class="side-community-item">
          ${communityAvatarHTML(comm, 'side-community-avatar')}
          <div>
            <strong>${escapeHTML(comm.name)}</strong>
            <span>${getCommunityMemberCount(comm)} participante(s)</span>
          </div>
        </a>
      `;
    }).join('');
  }

  function renderPublicPostActions(post) {
    return `
      <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="togglePublicPostLike(${post.id}, this)" type="button" aria-label="Curtir publicação">
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${post.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="like-count">${postLikesCount(post)}</span>
      </button>
      <span class="post-action-btn" aria-label="Comentários">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6A3.5 3.5 0 0 1 16.5 15H10l-5.5 5v-5A3.5 3.5 0 0 1 1 11.5v-6Z" />
        </svg>
        <span>${postCommentsCount(post)}</span>
      </span>
    `;
  }

  function renderPosts(posts) {
    if (!posts || posts.length === 0) {
      postsContainer.innerHTML = '<div class="api-empty-state">Nenhuma publicação ainda.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => {
      const when = relativeTime(post.created_at, 'feito');
      const communityLabel = post.community
        ? `<a class="post-community-chip" href="community.html?slug=${encodeURIComponent(post.community.slug)}">Publicado em ${escapeHTML(post.community.name)}</a>`
        : '<span class="post-community-chip">Publicado no feed</span>';

      return `
        <article class="post-card profile-post-item">
          <a href="${profileUrlFor(publicUser)}" class="avatar-link">${avatarHTML(publicUser)}</a>
          <div class="post-body">
            <div class="post-header">
              <div>
                <strong class="post-author">${escapeHTML(userDisplayName(publicUser))}</strong>
                <span>@${escapeHTML(publicUser.nickname)} ${when ? `· ${escapeHTML(when)}` : ''}</span>
              </div>
            </div>
            ${communityLabel}
            <p class="post-text">${escapeHTML(post.content)}</p>
            <div class="post-actions">${renderPublicPostActions(post)}</div>
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
    const name = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.nickname;

    if (userPhoto(user)) {
      avatar.innerHTML = `<img src="${escapeHTML(toApiUrl(userPhoto(user)))}" alt="Foto de ${escapeHTML(name)}">`;
      avatar.classList.add('has-image');
    } else {
      avatar.textContent = getInitials(name);
      avatar.classList.remove('has-image');
    }

    nameEl.textContent = name;
    bioEl.textContent = user.bio || 'Sem bio.';
    nicknameEl.textContent = `@${user.nickname}`;
    courseEl.textContent = user.course || 'Curso não informado';
    friendsCountEl.textContent = `${user.friends_count || 0} amigo(s)`;

    configureFriendButton(user);
    renderCommunities(createdContainer, user.created_communities || []);
    renderCommunities(joinedContainer, user.joined_communities || []);
    renderPosts(user.posts || []);
  }

  async function loadPublicProfile() {
    try {
      const response = await apiFetch(`/api/users/profile/${nickname}/`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        nameEl.textContent = 'Perfil não encontrado';
        bioEl.textContent = getApiError(data, 'Este usuário não existe.');
        postsContainer.innerHTML = '';
        createdContainer.innerHTML = '';
        joinedContainer.innerHTML = '';
        actionBtn.style.display = 'none';
        return;
      }

      renderProfile(data);
    } catch (error) {
      console.error(error);
      bioEl.textContent = 'Erro ao conectar com o servidor.';
    }
  }

  window.togglePublicPostLike = async function togglePublicPostLike(postId, btnElement) {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  await loadPublicProfile();
});
