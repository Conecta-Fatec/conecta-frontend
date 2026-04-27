document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');

  if (!slug) {
    window.location.href = 'communities.html';
    return;
  }

  let currentUser = await loadLoggedUser();
  let currentCommunity = null;
  let currentSlug = slug;
  let editCommunityModal = null;

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

  function renderMembers(members) {
    if (!members || members.length === 0) {
      membersContainer.innerHTML = '<div class="api-empty-state">Nenhum participante ainda.</div>';
      return;
    }

    membersContainer.innerHTML = members.map((member) => {
      const name = `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.nickname;
      return `
        <a href="profileuser.html?nickname=${encodeURIComponent(member.nickname)}" class="side-community-item">
          <div class="side-community-avatar">${getInitials(name)}</div>
          <div>
            <strong>${escapeHTML(name)}</strong>
            <span>@${escapeHTML(member.nickname)}</span>
          </div>
        </a>
      `;
    }).join('');
  }

  function renderCommunityDetails(data) {
    const comm = data.community;
    currentCommunity = comm;
    currentSlug = comm.slug;

    const creatorName = comm.creator?.full_name || comm.creator?.nickname || 'Usuário';
    commName.textContent = comm.name;
    commDesc.textContent = comm.description || 'Sem descrição.';
    commMembersCount.textContent = `${data.members_count || comm.total_members || 0} participante(s)`;
    commCreator.textContent = `Criada por ${creatorName}`;

    if (comm.photo_url) {
      commAvatar.innerHTML = `<img src="${escapeHTML(comm.photo_url)}" alt="Foto da comunidade ${escapeHTML(comm.name)}">`;
      commAvatar.classList.add('has-image');
    } else {
      commAvatar.textContent = getInitials(comm.name);
      commAvatar.classList.remove('has-image');
    }

    commActionBtn.style.display = 'inline-block';
    deleteCommunityBtn.style.display = comm.is_creator ? 'inline-block' : 'none';
    createPostCard.style.display = data.is_member ? 'block' : 'none';

    if (comm.is_creator) {
      commActionBtn.textContent = 'Editar comunidade';
      commActionBtn.className = 'btn btn-outline-primary fw-bold';
      commActionBtn.onclick = openEditCommunityModal;
    } else if (data.is_member) {
      commActionBtn.textContent = 'Sair da comunidade';
      commActionBtn.className = 'btn btn-outline-danger fw-bold';
      commActionBtn.onclick = leaveCommunity;
    } else {
      commActionBtn.textContent = 'Participar';
      commActionBtn.className = 'btn btn-primary fw-bold';
      commActionBtn.onclick = joinCommunity;
    }

    renderMembers(data.members || []);
    renderPosts(data.posts || [], data.is_member);
  }

  function renderPosts(posts, isMember) {
    if (!posts.length) {
      postsContainer.innerHTML = '<div class="api-empty-state text-center">Nenhum post nesta comunidade ainda.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => {
      const authorName = post.author.full_name || post.author.nickname;
      const isMyPost = currentUser && post.author.nickname === currentUser.nickname;
      const date = new Date(post.created_at).toLocaleDateString('pt-BR');
      const comments = post.top_level_comments || [];

      const commentsHTML = comments.map((comment) => {
        const commentAuthor = comment.author.full_name || comment.author.nickname;
        const isMyComment = currentUser && comment.author.nickname === currentUser.nickname;
        return `
          <div class="post-comment align-items-start">
            <div class="comment-avatar">${getInitials(commentAuthor)}</div>
            <div class="w-100" style="min-width:0;">
              <p>
                <strong>${escapeHTML(commentAuthor)}</strong>
                <span id="comment-text-content-${comment.id}" data-raw="${escapeHTML(comment.content)}">${escapeHTML(comment.content)}</span>
                ${comment.edited ? '<small class="text-muted">(editado)</small>' : ''}
              </p>
              <div class="d-flex gap-3 mt-1" style="font-size:0.8rem;color:#64748b;font-weight:600;">
                <span role="button" class="comment-action ${comment.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleCommentLike(${comment.id})">Curtir (${comment.total_likes})</span>
                ${isMyComment ? `<span role="button" onclick="enableCommentEdit(${comment.id})">Editar</span><span role="button" class="text-danger" onclick="deleteComment(${comment.id})">Excluir</span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      const commentInput = isMember ? `
        <div class="mt-3 d-flex gap-2">
          <input type="text" id="comment-input-${post.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Escreva um comentário...">
          <button class="btn login-btn py-1 px-3" style="border-radius:10px;" onclick="addComment(${post.id})">Enviar</button>
        </div>
      ` : '';

      return `
        <article class="post-card">
          <div class="user-avatar">${getInitials(authorName)}</div>
          <div class="post-body" style="min-width:0;">
            <div class="post-header">
              <div class="text-truncate">
                <strong class="post-author">${escapeHTML(authorName)}</strong>
                <span>@${escapeHTML(post.author.nickname)} · ${date} ${post.edited ? '· (editado)' : ''}</span>
              </div>
            </div>
            <div id="post-text-content-${post.id}" data-raw="${escapeHTML(post.content)}"><p class="post-text">${escapeHTML(post.content)}</p></div>
            <div class="post-actions">
              <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleLike(${post.id})">${post.liked_by_me ? '❤️' : '🤍'} ${post.total_likes}</button>
              <button class="post-action-btn" onclick="document.getElementById('comment-input-${post.id}')?.focus()">💬 ${post.comments_count}</button>
              ${isMyPost ? `<button class="post-action-btn owner-action" onclick="enablePostEdit(${post.id})">Editar</button><button class="post-action-btn owner-action delete-action text-danger" onclick="deletePost(${post.id})">Excluir</button>` : ''}
            </div>
            <div class="comments-section mt-2">${commentsHTML}${commentInput}</div>
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadCommunityDetails() {
    try {
      const response = await apiFetch(`/api/posts/communities/${currentSlug}/`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        commName.textContent = 'Comunidade não encontrada';
        commDesc.textContent = getApiError(data, 'Esta comunidade não existe ou foi excluída.');
        postsContainer.innerHTML = '';
        membersContainer.innerHTML = '';
        return;
      }

      renderCommunityDetails(data);
    } catch (error) {
      console.error(error);
      commDesc.textContent = 'Erro ao conectar com o servidor.';
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

  function openEditCommunityModal() {
    document.getElementById('editCommunityName').value = currentCommunity.name || '';
    document.getElementById('editCommunityBio').value = currentCommunity.description || '';
    document.getElementById('editCommunityError').style.display = 'none';
    editCommunityModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editCommunityModal'));
    editCommunityModal.show();
  }

  saveCommunityBtn.addEventListener('click', async () => {
    const name = document.getElementById('editCommunityName').value.trim();
    const description = document.getElementById('editCommunityBio').value.trim();
    const error = document.getElementById('editCommunityError');

    error.style.display = 'none';
    saveCommunityBtn.disabled = true;
    saveCommunityBtn.textContent = 'Salvando...';

    try {
      const response = await apiFetch(`/api/posts/communities/${currentSlug}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        error.textContent = getApiError(data, 'Erro ao editar comunidade.');
        error.style.display = 'block';
        return;
      }

      editCommunityModal.hide();
      if (data.community?.slug && data.community.slug !== currentSlug) {
        window.history.replaceState({}, '', `community.html?slug=${encodeURIComponent(data.community.slug)}`);
        currentSlug = data.community.slug;
      }
      await loadCommunityDetails();
    } catch (err) {
      console.error(err);
      error.textContent = 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      saveCommunityBtn.disabled = false;
      saveCommunityBtn.textContent = 'Salvar';
    }
  });

  deleteCommunityBtn.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja excluir esta comunidade?')) return;
    const response = await apiFetch(`/api/posts/communities/${currentSlug}/delete/`, { method: 'DELETE' });
    if (response.ok) window.location.href = 'communities.html';
  });

  publishBtn.addEventListener('click', async () => {
    const contentEl = document.getElementById('communityPostContent');
    const error = document.getElementById('communityPostError');
    const content = contentEl.value.trim();

    error.style.display = 'none';
    if (!content) return;

    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicando...';

    try {
      const response = await apiFetch(`/api/posts/communities/${currentSlug}/post/create/`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        error.textContent = getApiError(data, 'Erro ao publicar.');
        error.style.display = 'block';
        return;
      }

      contentEl.value = '';
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newCommunityPostModal')).hide();
      await loadCommunityDetails();
    } catch (err) {
      console.error(err);
      error.textContent = 'Erro de conexão com o servidor.';
      error.style.display = 'block';
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publicar';
    }
  });

  window.toggleLike = async (postId) => {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (response.ok) await loadCommunityDetails();
  };

  window.addComment = async (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/comment/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
  };

  window.toggleCommentLike = async (commentId) => {
    const response = await apiFetch(`/api/posts/comment/${commentId}/like/`, { method: 'POST' });
    if (response.ok) await loadCommunityDetails();
  };

  window.deletePost = async (postId) => {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    const response = await apiFetch(`/api/posts/post/${postId}/delete/`, { method: 'DELETE' });
    if (response.ok) await loadCommunityDetails();
  };

  window.enablePostEdit = (postId) => {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    const originalText = contentDiv.dataset.raw;
    contentDiv.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="200">${originalText}</textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" onclick="savePostEdit(${postId})">Salvar</button>
          <button class="btn btn-sm btn-secondary" onclick="loadCommunityDetailsFromButton()">Cancelar</button>
        </div>
      </div>`;
  };

  window.savePostEdit = async (postId) => {
    const content = document.getElementById(`edit-post-input-${postId}`).value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
  };

  window.enableCommentEdit = (commentId) => {
    const textSpan = document.getElementById(`comment-text-content-${commentId}`);
    const originalText = textSpan.dataset.raw;
    textSpan.innerHTML = `
      <div class="d-flex gap-2 mt-1 w-100">
        <input type="text" id="edit-comment-input-${commentId}" class="form-control form-control-sm custom-input w-100" maxlength="200" value="${originalText}">
        <button class="btn btn-sm btn-primary py-0 px-2" onclick="saveCommentEdit(${commentId})">Salvar</button>
        <button class="btn btn-sm btn-secondary py-0 px-2" onclick="loadCommunityDetailsFromButton()">✕</button>
      </div>`;
  };

  window.saveCommentEdit = async (commentId) => {
    const content = document.getElementById(`edit-comment-input-${commentId}`).value.trim();
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

  window.loadCommunityDetailsFromButton = loadCommunityDetails;

  await loadCommunityDetails();
});
