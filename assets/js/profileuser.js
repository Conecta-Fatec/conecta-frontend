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

    container.innerHTML = communities.map((community) => `
      <a href="community.html?slug=${encodeURIComponent(community.slug)}" class="side-community-item">
        <div class="side-community-avatar">${getInitials(community.name)}</div>
        <div>
          <strong>${escapeHTML(community.name)}</strong>
          <span>${community.total_members ?? 0} participante(s)</span>
        </div>
      </a>
    `).join('');
  }

  function renderPosts(posts) {
    if (!posts || posts.length === 0) {
      postsContainer.innerHTML = '<div class="api-empty-state">Nenhuma publicação ainda.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => {
      const date = new Date(post.created_at).toLocaleDateString('pt-BR');
      const communityLabel = post.community
        ? `<span class="text-muted">Publicado em <a href="community.html?slug=${encodeURIComponent(post.community.slug)}">${escapeHTML(post.community.name)}</a></span>`
        : '<span class="text-muted">Publicado no feed</span>';

      return `
        <article class="post-card">
          ${avatarHTML(publicUser)}
          <div class="post-body">
            <div class="post-header">
              <div>
                <strong class="post-author">${escapeHTML(publicUser.full_name || publicUser.nickname)}</strong>
                <span>@${escapeHTML(publicUser.nickname)} · ${date}</span>
              </div>
            </div>
            <p class="post-text">${escapeHTML(post.content)}</p>
            <div class="post-actions">${communityLabel}</div>
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

  await loadPublicProfile();
});
