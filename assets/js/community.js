/* =========================================================
   Comunidade: detalhes, membros, posts e Cropper Integrado
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

  let currentUser = await loadLoggedUser();
  let currentCommunity = null;
  let currentSlug = slug;
  let editCommunityModal = null;
  let commCropper = null;

  if (window.ConectaPosts) ConectaPosts.currentUserNickname = currentUser?.nickname || '';

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
  const communityGeneralTab = document.getElementById('community-general-tab');
  const communityFriendsTab = document.getElementById('community-friends-tab');

  let communityPostsCache = [];
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

  function normalizeCommunityDetails(data = {}) {
    const community = normalizeCommunity(data.community || data, data.members_count);
    const members = normalizeArray(data.members, 'results').length
      ? normalizeArray(data.members, 'results')
      : normalizeArray(community.members, 'results');
    const posts = normalizeArray(data.posts, 'results', 'items');
    const isMember = Boolean(data.is_member ?? community.is_member ?? community.member ?? community.is_creator);
    return {
      community,
      members,
      posts,
      isMember,
      membersCount: getCommunityMemberCount(community, data.members_count || members.length),
    };
  }

  function renderCommunityAvatar(community = {}) {
    if (!commAvatar) return;
    commAvatar.classList.remove('has-image');
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

    membersContainer.innerHTML = sorted.map((member) => {
      const memberUser = userProfileSource(member);
      const name = userDisplayName(memberUser);
      const nickname = memberUser.nickname || memberUser.username || 'usuario';

      return `
        <a href="${profileUrlFor(memberUser)}" class="side-community-item member-item ${member.__creator ? 'member-creator' : ''}">
          ${avatarHTML(memberUser, 'side-community-avatar')}
          <div>
            <strong>${escapeHTML(name)} ${member.__creator ? '<span class="creator-crown" title="Criador da comunidade">♛</span>' : ''}</strong>
            <span>@${escapeHTML(nickname)}${member.__creator ? ' · criador' : ''}</span>
          </div>
        </a>
      `;
    }).join('');
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

    const creator = creatorFromCommunity(community);
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
      if (community.is_creator) {
        commActionBtn.textContent = 'Editar comunidade';
        commActionBtn.className = 'btn btn-outline-primary fw-bold';
        commActionBtn.onclick = openEditCommunityModal;
      } else if (isMember) {
        commActionBtn.textContent = 'Sair da comunidade';
        commActionBtn.className = 'btn btn-outline-danger fw-bold';
        commActionBtn.onclick = leaveCommunity;
      } else {
        commActionBtn.textContent = 'Participar';
        commActionBtn.className = 'btn btn-primary fw-bold';
        commActionBtn.onclick = joinCommunity;
      }
    }

    if (deleteCommunityBtn) {
      deleteCommunityBtn.style.display = community.is_creator ? 'inline-flex' : 'none';
    }

    if (createPostCard) {
      createPostCard.style.display = isMember ? 'block' : 'none';
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

    if (highlightedPostId && window.ConectaPosts) ConectaPosts.openPostComments(highlightedPostId);

    postsContainer.innerHTML = posts.map((post) => ConectaPosts.renderPostCard(post, {
      currentUser,
      showCommunityLabel: false,
      allowCommentInput: isMember,
      canInteract: isMember,
    })).join('') + '<footer class="feed-footer community-posts-end">Fim dos posts</footer>';

    scrollToHighlightedPost();
  }

  async function loadCommunityDetails() {
    try {
      const response = await apiFetch(`/api/posts/communities/${currentSlug}/`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (commName) commName.textContent = 'Comunidade não encontrada';
        if (commDesc) commDesc.textContent = getApiError(data, 'Esta comunidade não existe ou foi excluída.');
        if (postsContainer) postsContainer.innerHTML = '';
        if (membersContainer) membersContainer.innerHTML = '';
        return;
      }

      renderCommunityDetails(data || {});
    } catch (error) {
      console.error(error);
      if (commDesc) commDesc.textContent = 'Erro ao conectar com o servidor.';
    }
  }

  async function joinCommunity() {
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/join/`, { method: 'POST' });
    if (response.ok) await loadCommunityDetails();
  }

  async function leaveCommunity() {
    if (!confirm('Tem certeza que deseja sair desta comunidade?')) return;
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/leave/`, { method: 'POST' });
    if (response.ok) window.location.href = 'communities.html';
  }

  // ==========================================
  // MODAL UNIFICADO: TEXTOS E FOTO
  // ==========================================
  function openEditCommunityModal() {
    document.getElementById('editCommunityName').value = currentCommunity.name || '';
    document.getElementById('editCommunityBio').value = currentCommunity.description || '';
    document.getElementById('editCommunityError').style.display = 'none';

    // Limpa o Cropper anterior
    if (commCropper) { commCropper.destroy(); commCropper = null; }
    document.getElementById('editCommPhotoInput').value = '';
    document.getElementById('commPhotoCropWrapper').classList.add('d-none');

    // Define a foto atual da comunidade no modal
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

  // Aciona o input de arquivo quando clica no ícone de câmera
  document.getElementById('triggerCommPhotoInput')?.addEventListener('click', () => {
    document.getElementById('editCommPhotoInput').click();
  });

  // Inicializa o Cropper quando a foto é selecionada
  document.getElementById('editCommPhotoInput')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    const wrapper = document.getElementById('commPhotoCropWrapper');
    const imageToCrop = document.getElementById('commPhotoToCrop');

    if (file) {
      const reader = new FileReader();
      reader.onload = function (event) {
        imageToCrop.src = event.target.result;
        wrapper.classList.remove('d-none'); // Mostra a caixa de recorte

        if (commCropper) commCropper.destroy();

        commCropper = new Cropper(imageToCrop, {
          aspectRatio: 1, // Mantém a proporção quadrada
          viewMode: 1,
          autoCropArea: 0.8,
          dragMode: 'move',
        });
      };
      reader.readAsDataURL(file);
    }
  });

  // Salva os dados (Textos + Foto, se houver)
  saveCommunityBtn?.addEventListener('click', async () => {
    const name = document.getElementById('editCommunityName').value.trim();
    const description = document.getElementById('editCommunityBio').value.trim();
    const error = document.getElementById('editCommunityError');

    error.style.display = 'none';
    saveCommunityBtn.disabled = true;
    saveCommunityBtn.textContent = 'Salvando...';

    try {
      let response;

      // Se o usuário selecionou e cortou uma imagem nova
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
        // Se o usuário apenas editou o nome ou a bio (envia como JSON)
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
      // Atualiza o link se o nome mudar
      if (data?.community?.slug && data.community.slug !== currentSlug) {
        window.history.replaceState({}, '', `community.html?slug=${encodeURIComponent(data.community.slug)}`);
        currentSlug = data.community.slug;
      }
      await loadCommunityDetails();
    } catch (err) {
      error.textContent = 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      saveCommunityBtn.disabled = false;
      saveCommunityBtn.textContent = 'Salvar';
    }
  });

  deleteCommunityBtn?.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja excluir esta comunidade?')) return;
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/delete/`, { method: 'DELETE' });
    if (response.ok) window.location.href = 'communities.html';
  });

  // Criação de Posts Internos (Otimizada via main.js)
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

  publishBtn?.addEventListener('click', async () => {
    const contentEl = document.getElementById('communityPostContent');
    const error = document.getElementById('communityPostError');
    const content = contentEl.value.trim();

    error.style.display = 'none';
    if (!content) return;

    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicando...';

    try {
      await createCommunityPost(content);
      contentEl.value = '';
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityPostModal')).hide();
      await loadCommunityDetails();
    } catch (err) {
      console.error(err);
      error.textContent = err.message || 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publicar';
    }
  });

  // Ações de Interação (Like, Comment, Edit)
  window.toggleLike = async (postId, btnElement = null) => {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    if (!btnElement) return loadCommunityDetails();
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.addComment = async (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/comment/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response.ok) {
      ConectaPosts.openPostComments(postId);
      await loadCommunityDetails();
    }
  };

  window.toggleCommentLike = async (commentId, btnElement = null) => {
    const response = await apiFetch(`/api/posts/comment/${commentId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    if (!btnElement) return loadCommunityDetails();
    const data = await response.json().catch(() => null);
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data?.liked);
    if (svg) svg.style.fill = data?.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.comment-like-count').textContent = data?.total_likes ?? data?.likes_count ?? 0;
  };

  window.deletePost = async (postId) => {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    const response = await apiFetch(`/api/posts/post/${postId}/delete/`, { method: 'DELETE' });
    if (response.ok) await loadCommunityDetails();
  };

  window.enablePostEdit = (postId) => {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    if (!contentDiv) return;
    const originalText = contentDiv.querySelector('.post-text')?.textContent || contentDiv.dataset.raw || '';
    contentDiv.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="280"></textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" type="button" onclick="savePostEdit(${postId})">Salvar</button>
          <button class="btn btn-sm btn-secondary" type="button" onclick="loadCommunityDetailsFromButton()">Cancelar</button>
        </div>
      </div>`;
    document.getElementById(`edit-post-input-${postId}`).value = originalText;
  };

  window.savePostEdit = async (postId) => {
    const content = document.getElementById(`edit-post-input-${postId}`)?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
  };

  window.enableCommentEdit = (commentId) => {
    const textSpan = document.getElementById(`comment-text-content-${commentId}`);
    if (!textSpan) return;
    const originalText = textSpan.textContent || textSpan.dataset.raw || '';
    textSpan.innerHTML = `
      <span class="comment-edit-inline">
        <input type="text" id="edit-comment-input-${commentId}" class="form-control form-control-sm custom-input" maxlength="200">
        <button class="btn btn-sm btn-primary py-0 px-2" type="button" onclick="saveCommentEdit(${commentId})">Salvar</button>
        <button class="btn btn-sm btn-secondary py-0 px-2" type="button" onclick="loadCommunityDetailsFromButton()">✕</button>
      </span>`;
    document.getElementById(`edit-comment-input-${commentId}`).value = originalText;
  };

  window.saveCommentEdit = async (commentId) => {
    const content = document.getElementById(`edit-comment-input-${commentId}`)?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/comment/${commentId}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
  };

  window.deleteComment = async (commentId) => {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return;
    const response = await apiFetch(`/api/posts/comment/${commentId}/delete/`, { method: 'DELETE' });
    if (response.ok) await loadCommunityDetails();
  };

  window.toggleReplyInput = (commentId) => {
    const box = document.getElementById(`reply-box-${commentId}`);
    box?.classList.toggle('d-none');
    if (box && !box.classList.contains('d-none')) document.getElementById(`reply-input-${commentId}`)?.focus();
  };

  window.addReply = async (commentId) => {
    const input = document.getElementById(`reply-input-${commentId}`);
    const content = input?.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/comment/${commentId}/reply/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
    else alert('Erro ao responder.');
  };

  window.loadCommunityDetailsFromButton = loadCommunityDetails;

  communityGeneralTab?.addEventListener('click', () => {
    setActiveCommunityTab('general');
    renderVisibleCommunityPosts();
  });

  communityFriendsTab?.addEventListener('click', () => {
    setActiveCommunityTab('friends');
    renderVisibleCommunityPosts();
  });

  // ==========================================
  // LÓGICA DO BOTÃO DE REFRESH NA COMUNIDADE
  // ==========================================
  const refreshCommBtn = document.getElementById('refreshCommunityBtn');
  if (refreshCommBtn) {
    refreshCommBtn.addEventListener('click', async () => {
      const icon = refreshCommBtn.querySelector('.refresh-icon');
      if (icon) icon.classList.add('spin-animation');
      refreshCommBtn.disabled = true;

      // Executa a busca
      await loadCommunityDetails();

      if (icon) icon.classList.remove('spin-animation');
      refreshCommBtn.disabled = false;
    });
  }

  await loadCommunityDetails();
});