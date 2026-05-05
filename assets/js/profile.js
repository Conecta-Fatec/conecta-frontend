/* =========================================================
   Perfil próprio: cabeçalho, listas limitadas e posts resumo
========================================================= */
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
  const postsCountEl = document.getElementById('profile-posts-count');
  const postsContainer = document.getElementById('profile-posts-container');
  const communitiesContainer = document.getElementById('profile-communities-container');
  const friendsContainer = document.getElementById('profile-friends-container');
  const openEditProfileBtn = document.getElementById('openEditProfileBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');

  const state = {
    communitiesVisible: 3,
    friendsVisible: 3,
    communities: [],
    friends: [],
  };

  function fillAvatarElement(element, user) {
    const name = userDisplayName(user);
    const photo = toApiUrl(userPhoto(user));
    element.classList.remove('has-image');
    element.setAttribute('data-photo-viewer', 'profile');
    element.dataset.photoTitle = name;

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

  function mergeCommunities(user = {}) {
    const created = normalizeArray(user.created_communities, 'results').map((community) => ({ ...community, __created: true }));
    const joined = normalizeArray(user.joined_communities, 'results').map((community) => ({ ...community, __created: Boolean(community.is_creator) }));

    return created.concat(joined)
      .filter((community, index, list) => list.findIndex((item) => item.slug === community.slug) === index)
      .map(normalizeCommunity)
      .sort((a, b) => Number(Boolean(b.__created || b.is_creator)) - Number(Boolean(a.__created || a.is_creator)) || getCommunityMemberCount(b) - getCommunityMemberCount(a));
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
            <span>${getCommunityMemberCount(comm)} participante(s)${isCreated ? ' · criada por você' : ''}</span>
          </div>
        </a>
      `;
    }).join('');

    if (communities.length > shown.length) {
      communitiesContainer.insertAdjacentHTML('beforeend', '<button type="button" class="load-more-btn compact" id="profileMoreCommunities">Ver mais</button>');
      document.getElementById('profileMoreCommunities').addEventListener('click', () => {
        state.communitiesVisible += 3;
        renderCommunities();
      });
    }
  }

  function renderFriends() {
    const friends = state.friends;
    if (!friendsContainer) return;
    if (!friends.length) {
      friendsContainer.innerHTML = '<div class="api-empty-state">Nenhuma amizade ainda.</div>';
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
      friendsContainer.insertAdjacentHTML('beforeend', '<button type="button" class="load-more-btn compact" id="profileMoreFriends">Ver mais</button>');
      document.getElementById('profileMoreFriends').addEventListener('click', () => {
        state.friendsVisible += 3;
        renderFriends();
      });
    }
  }

  function postCountsHTML(post = {}) {
    return `
      <span class="post-summary-metric">♡ ${postLikesCount(post)}</span>
      <span class="post-summary-metric">▱ ${postCommentsCount(post)}</span>
    `;
  }

  function renderPosts(posts = []) {
    if (!posts.length) {
      postsContainer.innerHTML = '<div class="api-empty-state">Você ainda não publicou nada.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => {
      const when = post.created_at ? relativeTime(post.created_at, 'feito') : '';
      const communityLabel = ConectaPosts?.renderCommunityChip ? ConectaPosts.renderCommunityChip(post) : '';
      const destination = postDestinationUrl(post);

      return `
        <article class="post-card profile-post-item clickable-post" data-post-url="${escapeHTML(destination)}">
          <a href="profile.html" class="avatar-link" onclick="event.stopPropagation()">${avatarHTML(currentUser)}</a>
          <div class="post-body">
            <div class="post-header">
              <div>
                <strong class="post-author">${escapeHTML(userDisplayName(currentUser))}</strong>
                <span class="post-username">@${escapeHTML(currentUser.nickname || 'usuario')}</span>
                ${when ? `<span> · ${escapeHTML(when)}</span>` : ''}
              </div>
            </div>
            ${communityLabel}
            <p class="post-text">${escapeHTML(post.content)}</p>
            <div class="post-actions post-summary-actions">${postCountsHTML(post)}</div>
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadFriendsCard(user) {
    let friends = normalizeArray(user.friends || user.friends_list, 'results');
    if (!friends.length) {
      try {
        const data = await apiJSON('/api/users/friends/');
        friends = normalizeArray(data, 'friends', 'results');
      } catch (error) {
        friends = [];
      }
    }
    state.friends = friends;
    renderFriends();
  }

  async function renderProfile(user) {
    currentUser = user;
    const posts = normalizeArray(user.posts, 'results');
    const name = userDisplayName(user);

    fillAvatarElement(avatar, user);
    nameEl.textContent = name;
    nicknameEl.textContent = `@${user.nickname || 'usuario'}`;
    friendsCountEl.textContent = `${user.friends_count || 0} amigo(s)`;
    postsCountEl.textContent = `${user.posts_count ?? posts.length} post(s)`;
    courseEl.textContent = user.course || 'Curso não informado';
    bioEl.textContent = user.bio || 'Sem bio.';

    state.communities = mergeCommunities(user);
    renderCommunities();
    renderPosts(posts);
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
      await loadLoggedUser(true);
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

  postsContainer.addEventListener('click', (event) => {
    const card = event.target.closest('[data-post-url]');
    if (!card || event.target.closest('a,button')) return;
    window.location.href = card.dataset.postUrl;
  });

  await loadProfile();
});
