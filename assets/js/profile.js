document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  let currentUser = null;
  let editProfileModal = null;

  const avatar = document.getElementById('profile-avatar');
  const nameEl = document.getElementById('profile-name');
  const bioEl = document.getElementById('profile-bio');
  const nicknameEl = document.getElementById('profile-nickname');
  const courseEl = document.getElementById('profile-course');
  const friendsCountEl = document.getElementById('profile-friends-count');
  const postsContainer = document.getElementById('profile-posts-container');
  const createdContainer = document.getElementById('created-communities-container');
  const joinedContainer = document.getElementById('joined-communities-container');
  const friendsContainer = document.getElementById('profile-friends-container');
  const openEditProfileBtn = document.getElementById('openEditProfileBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');

  function fillAvatarElement(element, user, sizeClass = 'community-page-avatar') {
    const name = userDisplayName(user);
    const photo = toApiUrl(userPhoto(user));
    element.classList.remove('has-image');
    if (photo) {
      element.innerHTML = `<img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}">`;
      element.classList.add('has-image');
    } else {
      element.innerHTML = escapeHTML(getInitials(name));
    }
  }

  function setCourseValue(course) {
    const select = document.getElementById('editCourse');
    const value = course || '';
    const option = [...select.options].find((item) => item.value === value || item.textContent === value);
    if (option) {
      select.value = option.value;
      return;
    }
    if (value) {
      const customOption = new Option(value, value, true, true);
      select.add(customOption);
    } else {
      select.value = '';
    }
  }

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

  function renderFriends(friends) {
    if (!friendsContainer) return;
    if (!friends || friends.length === 0) {
      friendsContainer.innerHTML = '<div class="api-empty-state">Nenhuma amizade ainda.</div>';
      return;
    }

    friendsContainer.innerHTML = friends.slice(0, 6).map((friend) => `
      <a href="${profileUrlFor(friend)}" class="side-community-item">
        ${avatarHTML(friend, 'side-community-avatar')}
        <div>
          <strong>${escapeHTML(userDisplayName(friend))}</strong>
          <span>@${escapeHTML(friend.nickname)}</span>
        </div>
      </a>
    `).join('');
  }

  function renderProfilePostActions(post) {
    return `
      <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleProfilePostLike(${post.id}, this)" type="button" aria-label="Curtir publicação">
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
      postsContainer.innerHTML = '<div class="api-empty-state">Você ainda não publicou nada.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => {
      const when = post.created_at ? relativeTime(post.created_at, 'feito') : '';
      const communityLabel = post.community
        ? `<a class="post-community-chip" href="community.html?slug=${encodeURIComponent(post.community.slug)}">Publicado em ${escapeHTML(post.community.name)}</a>`
        : '<span class="post-community-chip">Publicado no feed</span>';

      return `
        <article class="post-card profile-post-item">
          <a href="profile.html" class="avatar-link">${avatarHTML(currentUser)}</a>
          <div class="post-body">
            <div class="post-header">
              <div>
                <strong class="post-author">${escapeHTML(userDisplayName(currentUser))}</strong>
                <span>@${escapeHTML(currentUser.nickname)} ${when ? `· ${escapeHTML(when)}` : ''}</span>
              </div>
            </div>
            ${communityLabel}
            <p class="post-text">${escapeHTML(post.content)}</p>
            <div class="post-actions">${renderProfilePostActions(post)}</div>
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadFriendsCard(user) {
    let friends = user.friends || user.friends_list || [];
    if (!friends.length) {
      try {
        const data = await apiJSON('/api/users/friends/');
        friends = data.friends || data.results || data || [];
      } catch (error) {
        friends = [];
      }
    }
    renderFriends(friends);
  }

  async function renderProfile(user) {
    currentUser = user;
    const name = userDisplayName(user);

    fillAvatarElement(avatar, user);
    nameEl.textContent = name;
    bioEl.textContent = user.bio || 'Sem bio.';
    nicknameEl.textContent = `@${user.nickname}`;
    courseEl.textContent = user.course || 'Curso não informado';
    friendsCountEl.textContent = `${user.friends_count || 0} amigo(s)`;

    renderCommunities(createdContainer, user.created_communities || []);
    renderCommunities(joinedContainer, user.joined_communities || []);
    renderPosts(user.posts || []);
    await loadFriendsCard(user);
  }

  async function loadProfile() {
    try {
      const data = await apiJSON('/api/users/me/');
      saveLoggedUser(data);
      updateSidebarUser(data);
      await renderProfile(data);
    } catch (error) {
      console.error(error);
      bioEl.textContent = 'Erro ao carregar o perfil.';
    }
  }

  openEditProfileBtn.addEventListener('click', () => {
    if (!currentUser) return;

    document.getElementById('editFirstName').value = currentUser.first_name || '';
    document.getElementById('editLastName').value = currentUser.last_name || '';
    document.getElementById('editNickname').value = currentUser.nickname || '';
    setCourseValue(currentUser.course || '');
    document.getElementById('editBio').value = currentUser.bio || '';
    document.getElementById('editPhoto').value = '';
    document.getElementById('editProfileError').style.display = 'none';

    editProfileModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editProfileModal'));
    editProfileModal.show();
  });

  saveProfileBtn.addEventListener('click', async () => {
    const error = document.getElementById('editProfileError');
    const photo = document.getElementById('editPhoto').files[0];
    const formData = new FormData();

    formData.append('first_name', document.getElementById('editFirstName').value.trim());
    formData.append('last_name', document.getElementById('editLastName').value.trim());
    formData.append('nickname', document.getElementById('editNickname').value.trim());
    formData.append('course', document.getElementById('editCourse').value);
    formData.append('bio', document.getElementById('editBio').value.trim());
    if (photo) formData.append('photo', photo);

    error.style.display = 'none';
    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = 'Salvando...';

    try {
      const response = await apiFetch('/api/users/me/update/', {
        method: 'PATCH',
        body: formData,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        error.textContent = getApiError(data, 'Erro ao editar perfil.');
        error.style.display = 'block';
        return;
      }

      editProfileModal.hide();
      window.toggleProfilePostLike = async function toggleProfilePostLike(postId, btnElement) {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  await loadProfile();
    } catch (err) {
      console.error(err);
      error.textContent = 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = 'Salvar';
    }
  });

  window.toggleProfilePostLike = async function toggleProfilePostLike(postId, btnElement) {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  await loadProfile();
});
