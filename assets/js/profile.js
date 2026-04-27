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

    container.innerHTML = communities.map((community) => `
      <a href="community.html?slug=${encodeURIComponent(community.slug)}" class="side-community-item">
        ${community.photo_url ? `<div class="side-community-avatar has-image"><img src="${escapeHTML(toApiUrl(community.photo_url))}" alt="${escapeHTML(community.name)}"></div>` : `<div class="side-community-avatar static-avatar ${avatarColorClass(community.slug || community.name)}">${getInitials(community.name)}</div>`}
        <div>
          <strong>${escapeHTML(community.name)}</strong>
          <span>${community.total_members ?? 0} participante(s)</span>
        </div>
      </a>
    `).join('');
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

  function renderPosts(posts) {
    if (!posts || posts.length === 0) {
      postsContainer.innerHTML = '<div class="api-empty-state">Você ainda não publicou nada.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => {
      const date = post.created_at ? new Date(post.created_at).toLocaleDateString('pt-BR') : '';
      const communityLabel = post.community
        ? `<span class="text-muted">Publicado em <a href="community.html?slug=${encodeURIComponent(post.community.slug)}">${escapeHTML(post.community.name)}</a></span>`
        : '<span class="text-muted">Publicado no feed</span>';

      return `
        <article class="post-card">
          ${avatarHTML(currentUser)}
          <div class="post-body">
            <div class="post-header">
              <div>
                <strong class="post-author">${escapeHTML(userDisplayName(currentUser))}</strong>
                <span>@${escapeHTML(currentUser.nickname)} ${date ? `· ${date}` : ''}</span>
              </div>
            </div>
            <p class="post-text">${escapeHTML(post.content)}</p>
            <div class="post-actions">${communityLabel}</div>
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

  await loadProfile();
});
