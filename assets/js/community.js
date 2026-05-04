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
    const topLevel = normalizeArray(post.top_level_comments, 'results');
    const comments = normalizeArray(post.comments, 'results');
    const source = topLevel.length ? topLevel : comments;

    if (!source.some((comment) => comment.parent || comment.parent_id)) return source;

    const byId = new Map();
    source.forEach((comment) => {
      byId.set(comment.id, { ...comment, replies: getCommentReplies(comment).slice() });
    });

    const roots = [];
    byId.forEach((comment) => {
      const parentId = typeof comment.parent === 'object' ? comment.parent?.id : (comment.parent || comment.parent_id);
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
      const name = userDisplayName(member);
      return `
        <a href="${profileUrlFor(member)}" class="side-community-item">
          ${avatarHTML(member, 'side-community-avatar')}
          <div>
            <strong>${escapeHTML(name)}</strong>
            <span>@${escapeHTML(member.nickname || 'usuario')}</span>
          </div>
        </a>
      `;
    }).join('');
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

  function renderCommunityDetails(data) {
    const { community, members, posts, isMember, membersCount } = normalizeCommunityDetails(data);
    currentCommunity = community;
    currentSlug = community.slug || currentSlug;

    const creatorName = community.creator?.full_name || community.creator?.nickname || community.creator_name || 'Usuário';
    commName.textContent = community.name;
    commDesc.textContent = community.description || 'Sem descrição.';
    commMembersCount.textContent = `${membersCount} participante(s)`;
    commCreator.textContent = `Criada por ${creatorName}`;

    commAvatar.classList.remove('has-image');
    if (communityPhoto(community)) {
      commAvatar.innerHTML = `<img src="${escapeHTML(toApiUrl(communityPhoto(community)))}" alt="Foto da comunidade ${escapeHTML(community.name)}">`;
      commAvatar.classList.add('has-image');
    } else {
      commAvatar.textContent = getInitials(community.name);
    }

    commActionBtn.style.display = 'inline-flex';
    deleteCommunityBtn.style.display = community.is_creator ? 'inline-flex' : 'none';
    createPostCard.style.display = isMember ? 'block' : 'none';

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

    renderMembers(members);
    renderPosts(posts, isMember);
  }

  function renderCommentLikeButton(comment) {
    return `
      <button type="button" class="comment-action ${comment.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleCommentLike(${comment.id}, this)">
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${comment.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="comment-like-count">${comment.total_likes ?? comment.likes_count ?? 0}</span>
      </button>
    `;
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
        <div class="post-comment ${level > 0 ? 'comment-reply' : ''}">
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
              ${renderCommentLikeButton(comment)}
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

  function renderPostActions(post, isMyPost, isMember) {
    return `
      <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleLike(${post.id}, this)" type="button" ${!isMember ? 'disabled title="Participe da comunidade para interagir"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${post.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="like-count">${postLikesCount(post)}</span>
      </button>
      <button class="post-action-btn" onclick="document.getElementById('comment-input-${post.id}')?.focus()" type="button" ${!isMember ? 'disabled title="Participe da comunidade para comentar"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6A3.5 3.5 0 0 1 16.5 15H10l-5.5 5v-5A3.5 3.5 0 0 1 1 11.5v-6Z" />
        </svg>
        <span>${postCommentsCount(post)}</span>
      </button>
      ${isMyPost ? `<button class="post-action-btn owner-action" onclick="enablePostEdit(${post.id})" type="button">Editar</button><button class="post-action-btn owner-action delete-action text-danger" onclick="deletePost(${post.id})" type="button">Excluir</button>` : ''}
    `;
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
      const when = relativeTime(post.created_at || post.updated_at, 'feito');
      const comments = getPostComments(post);
      const commentsHTML = renderComments(comments, isMember);

      const commentInput = isMember ? `
        <div class="comment-input-row mt-3">
          <input type="text" id="comment-input-${post.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Escreva um comentário...">
          <button class="btn login-btn py-1 px-3" type="button" onclick="addComment(${post.id})">Enviar</button>
        </div>
      ` : '';

      return `
        <article class="post-card">
          <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author)}</a>
          <div class="post-body" style="min-width:0;">
            <div class="post-header">
              <div class="text-truncate">
                ${userLinkHTML(author, authorName, 'post-author')}
                <span>@${escapeHTML(author.nickname || 'usuario')} ${when ? `· ${escapeHTML(when)}` : ''} ${post.edited ? '· (editado)' : ''}</span>
              </div>
            </div>
            <div id="post-text-content-${post.id}" data-raw="${escapeHTML(post.content)}"><p class="post-text">${escapeHTML(post.content)}</p></div>
            <div class="post-actions">${renderPostActions(post, isMyPost, isMember)}</div>
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

      renderCommunityDetails(data || {});
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
    if (document.getElementById('editCommunityPhoto')) document.getElementById('editCommunityPhoto').value = '';
    document.getElementById('editCommunityError').style.display = 'none';
    editCommunityModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editCommunityModal'));
    editCommunityModal.show();
  }

  saveCommunityBtn.addEventListener('click', async () => {
    const name = document.getElementById('editCommunityName').value.trim();
    const description = document.getElementById('editCommunityBio').value.trim();
    const photo = document.getElementById('editCommunityPhoto')?.files?.[0];
    const error = document.getElementById('editCommunityError');

    error.style.display = 'none';
    saveCommunityBtn.disabled = true;
    saveCommunityBtn.textContent = 'Salvando...';

    try {
      let body;
      if (photo) {
        body = new FormData();
        body.append('name', name);
        body.append('description', description);
        body.append('photo', photo);
      } else {
        body = JSON.stringify({ name, description });
      }

      const response = await apiFetch(`/api/posts/communities/${currentSlug}/update/`, {
        method: 'PATCH',
        body,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        error.textContent = getApiError(data, 'Erro ao editar comunidade.');
        error.style.display = 'block';
        return;
      }

      editCommunityModal.hide();
      if (data?.community?.slug && data.community.slug !== currentSlug) {
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

  async function createCommunityPost(content) {
    const payloadWithCommunity = buildCommunityPostPayload(content, currentCommunity || { slug: currentSlug });
    const attempts = [
      {
        path: `/api/posts/communities/${currentSlug}/post/create/`,
        body: payloadWithCommunity,
      },
      {
        path: `/api/posts/community/${currentSlug}/post/create/`,
        body: payloadWithCommunity,
      },
      {
        path: '/api/posts/feed/create/',
        body: payloadWithCommunity,
      },
      {
        path: `/api/posts/communities/${currentSlug}/post/create/`,
        body: { content },
      },
    ];

    let lastData = null;
    let lastResponse = null;

    for (const attempt of attempts) {
      const response = await apiFetch(attempt.path, {
        method: 'POST',
        body: JSON.stringify(attempt.body),
      });
      const data = await response.json().catch(() => null);
      lastData = data;
      lastResponse = response;

      if (response.ok) return { response, data };
      if (![400, 404, 405].includes(response.status)) break;
    }

    const error = new Error(getApiError(lastData, 'Erro ao publicar.'));
    error.response = lastResponse;
    error.data = lastData;
    throw error;
  }

  publishBtn.addEventListener('click', async () => {
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
    const content = input.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/comment/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response.ok) await loadCommunityDetails();
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
      <span class="comment-edit-inline">
        <input type="text" id="edit-comment-input-${commentId}" class="form-control form-control-sm custom-input" maxlength="200" value="${originalText}">
        <button class="btn btn-sm btn-primary py-0 px-2" onclick="saveCommentEdit(${commentId})">Salvar</button>
        <button class="btn btn-sm btn-secondary py-0 px-2" onclick="loadCommunityDetailsFromButton()">✕</button>
      </span>`;
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
