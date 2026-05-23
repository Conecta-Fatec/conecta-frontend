/* =========================================================
   Perfil próprio: cabeçalho, listas limitadas e Cropper Unificado
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  let currentUser = null;
  let editProfileModal = null;
  let cropper = null;

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
    postsVisible: 5,
    communities: [],
    friends: [],
    posts: [],
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
      return;
    }

    element.innerHTML = escapeHTML(getInitials(name));
  }

  function setCourseValue(course) {
    const select = document.getElementById('editCourse');
    const value = course || '';
    const option = [...select.options].find((item) => item.value === value || item.textContent === value);

    if (option) { select.value = option.value; return; }
    if (value) { const customOption = new Option(value, value, true, true); select.add(customOption); return; }
    select.value = '';
  }

  function mergeCommunities(user = {}) {
    const created = normalizeArray(user.created_communities, 'results').map((community) => ({ ...community, __created: true }));
    const joined = normalizeArray(user.joined_communities, 'results').map((community) => ({ ...community, __created: Boolean(community.is_creator) }));

    return created
      .concat(joined)
      .filter((community, index, list) => list.findIndex((item) => item.slug === community.slug) === index)
      .map(normalizeCommunity)
      .sort((a, b) => (Number(Boolean(b.__created || b.is_creator)) - Number(Boolean(a.__created || a.is_creator))) || getCommunityMemberCount(b) - getCommunityMemberCount(a));
  }

  function postSourceHTML(post = {}) {
    const community = post.community || post.community_data || null;
    const communityName = (community?.name || post.community_name || post.community_title || post.community_display_name || '');
    if (communityName) { return `<span class="profile-post-source">Feito em ${escapeHTML(communityName)}</span>`; }
    return '<span class="profile-post-source">Feito no feed</span>';
  }

  function renderCommunities() {
    const communities = state.communities;
    if (!communities.length) { communitiesContainer.innerHTML = '<div class="api-empty-state">Nenhuma comunidade.</div>'; return; }

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
      communitiesContainer.insertAdjacentHTML('beforeend', '<button type="button" class="load-more-btn compact" id="profileMoreCommunities">Ver mais</button>');
      document.getElementById('profileMoreCommunities').addEventListener('click', () => { state.communitiesVisible += 3; renderCommunities(); });
    }
  }

  function renderFriends() {
    const friends = state.friends;
    if (!friendsContainer) return;
    if (!friends.length) { friendsContainer.innerHTML = '<div class="api-empty-state">Nenhuma amizade ainda.</div>'; return; }

    const shown = friends.slice(0, state.friendsVisible);
    friendsContainer.innerHTML = shown.map((friend) => `
      <a href="${profileUrlFor(friend)}" class="side-friend-item">
        ${avatarHTML(friend, 'friend-card-avatar side-friend-avatar')}
        <div>
          <strong>${escapeHTML(userDisplayName(friend))}</strong>
          <span>@${escapeHTML(friend.nickname || 'usuario')}</span>
        </div>
      </a>
    `).join('');

    if (friends.length > shown.length) {
      friendsContainer.insertAdjacentHTML('beforeend', '<button type="button" class="load-more-btn compact" id="profileMoreFriends">Ver mais</button>');
      document.getElementById('profileMoreFriends').addEventListener('click', () => { state.friendsVisible += 3; renderFriends(); });
    }
  }

  function renderPosts() {
    const posts = state.posts || [];
    if (!posts.length) { postsContainer.innerHTML = '<div class="api-empty-state">Você ainda não publicou nada.</div>'; return; }

    const shown = posts.slice(0, state.postsVisible);
    postsContainer.innerHTML = shown.map((post) => {
      // Salva no cache da RAM
      if (window.ConectaPosts && window.ConectaPosts.postCache) {
         window.ConectaPosts.postCache.set(String(post.id), post);
      }

      const when = post.created_at ? relativeTime(post.created_at, 'feito') : '';
      const whenCompact = post.created_at ? compactRelativeTime(post.created_at) : '';
      const destination = postDestinationUrl(post);
      const fullName = userDisplayName(currentUser);
      const shortName = truncateText(fullName, 20);
      const fullNick = currentUser.nickname || 'usuario';
      const shortNick = truncateText(fullNick, 20);

      return `
        <article class="post-card profile-post-item clickable-post post-card-clickable" id="post-${post.id}" data-post-url="${escapeHTML(destination)}" data-can-interact="false">
          <a href="profile.html" class="avatar-link" onclick="event.stopPropagation()">${avatarHTML(currentUser)}</a>
          <div class="post-body">
            <div class="post-header">
              <div class="post-header-main">
                <strong class="post-author" title="${escapeHTML(fullName)}">${escapeHTML(shortName)}</strong>
                <span class="post-username" title="@${escapeHTML(fullNick)}">@${escapeHTML(shortNick)}</span>
                ${when ? `<span class="post-date-link" title="${escapeHTML(when)}"><span class="date-separator"> · </span><span class="date-full">${escapeHTML(when)}</span><span class="date-short">${escapeHTML(whenCompact)}</span></span>` : ''}
              </div>
            </div>
            <p class="post-text">${escapeHTML(post.content)}</p>
            ${postSourceHTML(post)}
            <div class="inline-comments-placeholder" id="inline-comments-${post.id}"></div>
          </div>
        </article>
      `;
    }).join('');

    if (posts.length > shown.length) {
      postsContainer.insertAdjacentHTML('beforeend', '<div class="profile-posts-footer"><button type="button" class="load-more-btn compact" id="profileMorePosts">Ver mais</button></div>');
      document.getElementById('profileMorePosts').addEventListener('click', () => { state.postsVisible += 5; renderPosts(); });
      return;
    }
    postsContainer.insertAdjacentHTML('beforeend', '<div class="feed-footer profile-posts-end">Fim dos posts</div>');
  }

  async function loadFriendsCard(user) {
    let friends = normalizeArray(user.friends || user.friends_list, 'results');
    if (!friends.length) {
      try {
        const data = await apiJSON('/api/users/friends/');
        friends = normalizeArray(data, 'friends', 'results');
      } catch (error) { friends = []; }
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
    state.posts = posts;
    state.postsVisible = 5;

    renderCommunities();
    renderPosts();
    await loadFriendsCard(user);
  }

async function loadProfile(silent = false) {
    const cacheKey = '@conecta:cache_perfil';

    await window.useSWR(
      cacheKey,
      // Fetcher: Busca os dados na API
      () => apiJSON('/api/users/me/'),
      // Render: Atualiza o ecrã com as informações
      async (data, { isCache }) => {
        if (!isCache) {
          saveLoggedUser(data);
          updateSidebarUser(data);
        }
        await renderProfile(data);
      },
      // Opções: Skeleton Loader e Tratamento de Erros
      {
        silent: silent,
        storage: 'local', // Mantém o cache persistente do perfil
        onLoading: () => {
          // 1. Skeletons para as Listas (Posts, Comunidades, Amigos)
          const skeletonPost = `
            <div class="post-card placeholder-glow" style="border: 1px solid var(--border-color); background: var(--post-surface); padding: 1.15rem; border-radius: 1.25rem; display: flex; gap: 1rem; width: 100%;">
              <div class="placeholder rounded-circle" style="width: 50px; height: 50px; background-color: var(--line-color); flex-shrink: 0;"></div>
              <div class="w-100 mt-1">
                <div class="placeholder rounded w-50 mb-2" style="height: 14px; background-color: var(--line-color);"></div>
                <div class="placeholder rounded w-25 mb-4" style="height: 12px; background-color: var(--line-color);"></div>
                <div class="placeholder rounded w-100 mb-2" style="height: 16px; background-color: var(--line-color);"></div>
              </div>
            </div>
          `;
            
          const skeletonSideItem = `
            <div class="side-community-item placeholder-glow" style="display: flex; align-items: center; gap: 0.85rem; padding: 0.82rem 0; width: 100%; border-bottom: 1px solid var(--line-color);">
              <div class="placeholder rounded-circle" style="width: 3.55rem; height: 3.55rem; background-color: var(--line-color); flex-shrink: 0;"></div>
              <div class="w-100 mt-1">
                <div class="placeholder rounded w-75 mb-2" style="height: 14px; background-color: var(--line-color);"></div>
                <div class="placeholder rounded w-50" style="height: 12px; background-color: var(--line-color);"></div>
              </div>
            </div>
          `;

          if (postsContainer) postsContainer.innerHTML = skeletonPost + skeletonPost;
          if (communitiesContainer) communitiesContainer.innerHTML = skeletonSideItem + skeletonSideItem;
          if (friendsContainer) friendsContainer.innerHTML = skeletonSideItem + skeletonSideItem;

          // 2. Efeito visual de carregamento (Skeleton) nos textos do cabeçalho
          if (nameEl) nameEl.innerHTML = '<span class="placeholder col-6 rounded placeholder-glow" style="background-color: var(--line-color);"></span>';
          if (nicknameEl) nicknameEl.innerHTML = '<span class="placeholder col-4 rounded placeholder-glow" style="background-color: var(--line-color);"></span>';
          if (bioEl) bioEl.innerHTML = '<span class="placeholder col-8 rounded placeholder-glow" style="background-color: var(--line-color);"></span>';
          if (courseEl) courseEl.innerHTML = '<span class="placeholder col-5 rounded placeholder-glow" style="background-color: var(--line-color);"></span>';
          if (friendsCountEl) friendsCountEl.innerHTML = '<span class="placeholder col-8 rounded placeholder-glow" style="background-color: var(--line-color);"></span>';
          if (postsCountEl) postsCountEl.innerHTML = '<span class="placeholder col-8 rounded placeholder-glow" style="background-color: var(--line-color);"></span>';
        },
        onError: (error, hasCache) => {
          if (!silent && !hasCache) bioEl.innerHTML = '<span class="text-danger">Erro ao carregar o perfil.</span>';
        }
      }
    );
  }
  // ==========================================
  // MODAL UNIFICADO: DADOS DE TEXTO E FOTO
  // ==========================================
  openEditProfileBtn?.addEventListener('click', () => {
    if (!currentUser) return;
    
    // Preenche os textos
    document.getElementById('editFirstName').value = currentUser.first_name || '';
    document.getElementById('editLastName').value = currentUser.last_name || '';
    document.getElementById('editNickname').value = currentUser.nickname || '';
    setCourseValue(currentUser.course || '');
    document.getElementById('editBio').value = currentUser.bio || '';
    document.getElementById('editProfileError').style.display = 'none';

    // Prepara e limpa o Cropper
    if (cropper) { cropper.destroy(); cropper = null; }
    const fileInput = document.getElementById('editProfilePhotoInput');
    if (fileInput) fileInput.value = '';
    
    document.getElementById('profilePhotoCropWrapper')?.classList.add('d-none');

    // Define a foto atual no preview redondo
    const previewImg = document.getElementById('editProfileAvatarPreview');
    const photoUrl = toApiUrl(userPhoto(currentUser));
    if (photoUrl) {
        previewImg.src = photoUrl;
        previewImg.style.display = 'block';
    } else {
        previewImg.style.display = 'none';
    }

    editProfileModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editProfileModal'));
    editProfileModal.show();
  });

  // Clicar no avatar redondo abre o selecionador de arquivo
  document.getElementById('triggerProfilePhotoInput')?.addEventListener('click', () => {
      document.getElementById('editProfilePhotoInput').click();
  });

  // Inicializa o Cropper quando uma foto nova é selecionada
  document.getElementById('editProfilePhotoInput')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    const wrapper = document.getElementById('profilePhotoCropWrapper');
    const imageToCrop = document.getElementById('profilePhotoToCrop');

    if (file) {
      const reader = new FileReader();
      reader.onload = function (event) {
        imageToCrop.src = event.target.result;
        wrapper.classList.remove('d-none');

        if (cropper) cropper.destroy();

        cropper = new Cropper(imageToCrop, {
          aspectRatio: 1, // Quadrado
          viewMode: 1,
          autoCropArea: 0.8,
          dragMode: 'move',
        });
      };
      reader.readAsDataURL(file);
    }
  });

  // Salva textos e imagem num único botão
  saveProfileBtn?.addEventListener('click', async () => {
    const error = document.getElementById('editProfileError');
    const formData = new FormData();

    formData.append('first_name', document.getElementById('editFirstName').value.trim());
    formData.append('last_name', document.getElementById('editLastName').value.trim());
    formData.append('nickname', document.getElementById('editNickname').value.trim());
    formData.append('course', document.getElementById('editCourse').value);
    formData.append('bio', document.getElementById('editBio').value.trim());

    error.style.display = 'none';
    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = 'Salvando...';

    try {
      // Se houver uma foto sendo cortada, adiciona ao FormData
      if (cropper) {
          await new Promise((resolve) => {
            const canvas = cropper.getCroppedCanvas({ width: 400, height: 400, fillColor: '#fff' });
            canvas.toBlob((blob) => { formData.append('photo', blob, 'perfil.jpg'); resolve(); }, 'image/jpeg', 0.9);
          });
      }

      const response = await apiFetch('/api/users/me/update/', { method: 'PATCH', body: formData });
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

  // ==========================================
  // CLIQUE NOS POSTS
  // ==========================================
  postsContainer.addEventListener('click', (event) => {
    const card = event.target.closest('[data-post-url]');
    if (!card || event.target.closest('a,button')) return;

    window.location.href = card.dataset.postUrl;
  });

  await loadProfile();
});