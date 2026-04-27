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

  function getCommentReplies(comment = {}) {
    const replies = comment.replies || comment.children || comment.answers || [];
    return Array.isArray(replies) ? replies : [];
  }

  function getPostComments(post = {}) {
    const topLevel = Array.isArray(post.top_level_comments) ? post.top_level_comments : [];
    const comments = Array.isArray(post.comments) ? post.comments : [];
    const source = topLevel.length ? topLevel : comments;

    if (!source.some((comment) => comment.parent)) return source;

    const byId = new Map();
    source.forEach((comment) => {
      byId.set(comment.id, { ...comment, replies: getCommentReplies(comment).slice() });
    });

    const roots = [];
    byId.forEach((comment) => {
      const parentId = typeof comment.parent === 'object' ? comment.parent?.id : comment.parent;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId).replies.push(comment);
      } else {
        roots.push(comment);
      }
    });

    return roots;
  }

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

  function renderComments(comments = [], isMember = false, level = 0) {
    if (!comments.length) return '';

    return comments.map((comment) => {
      const author = comment.author || {};
      const commentAuthor = userDisplayName(author);
      const isMyComment = currentUser && author.nickname === currentUser.nickname;
      const replies = getCommentReplies(comment);
      const replyLabel = replies.length || comment.replies_count || 0;

      return `
        <div class="post-comment ${level > 0 ? 'comment-reply' : ''} align-items-start">
          <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author, 'comment-avatar')}</a>
          <div class="comment-body">
            <p class="comment-text-line">
              <span class="comment-meta">
                ${userLinkHTML(author, commentAuthor, 'comment-author')}
                <span class="comment-username">@${escapeHTML(author.nickname || 'usuario')}</span>
              </span>
              <span id="comment-text-content-${comment.id}" class="comment-content" data-raw="${escapeHTML(comment.content)}">${escapeHTML(comment.content)}</span>
              ${comment.edited ? '<small class="text-muted">(editado)</small>' : ''}
            </p>
            <div class="comment-actions">
              <button type="button" class="comment-action ${comment.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleCommentLike(${comment.id})">
                Curtir (${comment.total_likes ?? 0})
              </button>
              ${isMember ? `<button type="button" class="comment-action" onclick="toggleReplyInput(${comment.id})">Responder (${replyLabel})</button>` : ''}
              ${isMyComment ? `
                <button type="button" class="comment-action" onclick="enableCommentEdit(${comment.id})">Editar</button>
                <button type="button" class="comment-action text-danger" onclick="deleteComment(${comment.id})">Excluir</button>
              ` : ''}
            </div>
            ${isMember ? `
              <div id="reply-box-${comment.id}" class="reply-box d-none">
                <input type="text" id="reply-input-${comment.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Responda a ${escapeHTML(commentAuthor)}...">
                <button class="btn login-btn py-1 px-2" type="button" onclick="addReply(${comment.id})">Enviar</button>
              </div>
            ` : ''}
            ${replies.length ? `<div class="comment-replies">${renderComments(replies, isMember, level + 1)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPosts(posts, isMember) {
    if (!posts.length) {
      postsContainer.innerHTML = '<div class="api-empty-state text-center">Nenhum post nesta comunidade ainda.</div>';
      return;
    }

    postsContainer.innerHTML = posts.map((post) => {
      const author = post.author || {};
      const authorName = userDisplayName(author);
      const isMyPost = currentUser && author.nickname === currentUser.nickname;
      const date = new Date(post.created_at).toLocaleDateString('pt-BR');
      const comments = getPostComments(post);
      const commentsHTML = renderComments(comments, isMember);

      const commentInput = isMember ? `
        <div class="mt-3 d-flex gap-2">
          <input type="text" id="comment-input-${post.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Escreva um comentário...">
          <button class="btn login-btn py-1 px-3" style="border-radius:10px;" onclick="addComment(${post.id})">Enviar</button>
        </div>
      ` : '';

      return `
        <article class="post-card">
          <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author)}</a>
          <div class="post-body" style="min-width:0;">
            <div class="post-header">
              <div class="text-truncate">
                ${userLinkHTML(author, authorName, 'post-author')}
                <span>@${escapeHTML(author.nickname || 'usuario')} · ${date} ${post.edited ? '· (editado)' : ''}</span>
              </div>
            </div>
            <div id="post-text-content-${post.id}" data-raw="${escapeHTML(post.content)}"><p class="post-text">${escapeHTML(post.content)}</p></div>
            <div class="post-actions">
              <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleLike(${post.id})">${post.liked_by_me ? '❤️' : '♡'} ${post.total_likes ?? 0}</button>
              <button class="post-action-btn" onclick="document.getElementById('comment-input-${post.id}')?.focus()">💬 ${post.comments_count ?? 0}</button>
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

  await loadCommunityDetails();
});
