document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const postsContainer = document.getElementById('posts-container');
  const generalTab = document.getElementById('general-tab');
  const friendsTab = document.getElementById('friends-tab');
  const publishBtn = document.getElementById('publishBtn');
  const postInput = document.getElementById('postContent');
  let currentUser = getLoggedUserFromStorage();
  let currentMode = 'general';
  let cachedFriends = [];

  try {
    currentUser = await loadLoggedUser() || currentUser;
  } catch (error) {
    console.error(error);
  }

  function setActiveTab(mode) {
    currentMode = mode;
    generalTab?.classList.toggle('active', mode === 'general');
    friendsTab?.classList.toggle('active', mode === 'friends');
  }

  async function loadFriendsNicknames() {
    if (cachedFriends.length) return cachedFriends;
    try {
      const data = await apiJSON('/api/users/friends/');
      cachedFriends = (data.friends || data.results || data || []).map((friend) => friend.nickname).filter(Boolean);
    } catch (error) {
      cachedFriends = [];
    }
    return cachedFriends;
  }

  async function fetchPosts(mode) {
    if (mode === 'friends') {
      try {
        return await tryApiJSON([
          '/api/posts/feed/friends/',
          '/api/posts/feed/?scope=friends',
          '/api/posts/feed/?filter=friends',
        ]);
      } catch (error) {
        const allPosts = await apiJSON('/api/posts/feed/');
        const friends = await loadFriendsNicknames();
        const posts = Array.isArray(allPosts) ? allPosts : allPosts.results || [];
        return posts.filter((post) => friends.includes(post.author?.nickname));
      }
    }

    const data = await apiJSON('/api/posts/feed/');
    return Array.isArray(data) ? data : data.results || [];
  }

  window.loadPosts = async function loadPosts(silent = false) {
    try {
      if (!silent) postsContainer.innerHTML = '<p class="text-center mt-4 text-muted">Carregando publicações...</p>';
      const posts = await fetchPosts(currentMode);
      renderPosts(posts);
    } catch (error) {
      console.error(error);
      if (!silent) postsContainer.innerHTML = '<p class="text-danger text-center mt-4">Erro ao carregar publicações.</p>';
    }
  };

  function renderPostActions(post, isOwner) {
    return `
      <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleLike(${post.id}, this)">
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${post.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="like-count">${post.total_likes ?? 0}</span>
      </button>
      <button class="post-action-btn" onclick="document.getElementById('comment-input-${post.id}')?.focus()">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.25c4.97 0 9-3.36 9-7.5s-4.03-7.5-9-7.5-9 3.36-9 7.5c0 1.64.64 3.15 1.72 4.38L3.75 21l4.2-1.35c1.22.38 2.59.6 4.05.6Z" />
        </svg>
        <span>${post.comments_count ?? 0}</span>
      </button>
      ${isOwner ? `
        <button class="post-action-btn owner-action" onclick="enablePostEdit(${post.id})">Editar</button>
        <button class="post-action-btn owner-action delete-action text-danger" onclick="deletePost(${post.id})">Excluir</button>
      ` : ''}
    `;
  }

  function renderComments(comments = [], level = 0) {
    if (!comments.length) return '';

    return comments.map((comment) => {
      const author = comment.author || {};
      const isOwner = author.nickname === currentUser?.nickname;
      const replies = comment.replies || comment.children || comment.answers || comment.comments || [];
      const replyLabel = replies.length || comment.replies_count || 0;

      return `
        <div class="post-comment ${level > 0 ? 'comment-reply' : ''}">
          <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author, 'comment-avatar')}</a>
          <div class="comment-body">
            <p>
              ${userLinkHTML(author, userDisplayName(author), 'comment-author')}
              <span id="comment-text-content-${comment.id}" data-raw="${escapeHTML(comment.content)}">${escapeHTML(comment.content)}</span>
              ${comment.edited ? '<small class="text-muted">(editado)</small>' : ''}
            </p>
            <div class="comment-actions">
              <button class="comment-action ${comment.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleCommentLike(${comment.id}, this)" type="button">
                <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${comment.liked_by_me ? 'currentColor' : 'none'};">
                  <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
                </svg>
                <span class="comment-like-count">${comment.total_likes ?? 0}</span>
              </button>
              <button class="comment-action" onclick="toggleReplyInput(${comment.id})" type="button">Responder (${replyLabel})</button>
              ${isOwner ? `
                <button class="comment-action" onclick="enableCommentEdit(${comment.id})" type="button">Editar</button>
                <button class="comment-action text-danger" onclick="deleteComment(${comment.id})" type="button">Excluir</button>
              ` : ''}
            </div>
            <div id="reply-box-${comment.id}" class="reply-box d-none">
              <input type="text" id="reply-input-${comment.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Responda a ${escapeHTML(userDisplayName(author))}...">
              <button class="btn login-btn py-1 px-2" type="button" onclick="addReply(${comment.id})">Enviar</button>
            </div>
            <div class="comment-replies">${renderComments(replies, level + 1)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPosts(posts) {
    postsContainer.innerHTML = '';
    if (!posts || posts.length === 0) {
      postsContainer.innerHTML = currentMode === 'friends'
        ? '<p class="text-center mt-4 text-muted">Nenhuma publicação dos seus amigos ainda.</p>'
        : '<p class="text-center mt-4 text-muted">Nenhuma publicação ainda.</p>';
      return;
    }

    posts.forEach((post) => {
      const author = post.author || {};
      const isOwner = author.nickname === currentUser?.nickname;
      const authorName = userDisplayName(author);
      const comments = post.top_level_comments || post.comments || [];

      postsContainer.insertAdjacentHTML('beforeend', `
        <article class="post-card">
          <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author)}</a>
          <div class="post-body" style="min-width:0;">
            <div class="post-header">
              <div class="text-truncate">
                ${userLinkHTML(author, authorName, 'post-author')}
                <span>@${escapeHTML(author.nickname || 'usuario')} ${post.edited ? '· <small>(editado)</small>' : ''}</span>
              </div>
            </div>
            <div id="post-text-content-${post.id}" data-raw="${escapeHTML(post.content)}">
              <p class="post-text">${escapeHTML(post.content)}</p>
            </div>
            <div class="post-actions">${renderPostActions(post, isOwner)}</div>
            <div class="comments-section mt-2">
              ${renderComments(comments)}
              <div class="mt-3 d-flex gap-2">
                <input type="text" id="comment-input-${post.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Escreva um comentário...">
                <button class="btn login-btn py-1 px-3" type="button" onclick="addComment(${post.id})">Enviar</button>
              </div>
            </div>
          </div>
        </article>
      `);
    });

    postsContainer.insertAdjacentHTML('beforeend', '<footer class="feed-footer">Fim dos posts</footer>');
  }

  window.deletePost = async function deletePost(postId) {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    try {
      await apiFetch(`/api/posts/post/${postId}/delete/`, { method: 'DELETE' });
      loadPosts(true);
    } catch (error) {
      alert('Erro ao excluir o post.');
    }
  };

  window.deleteComment = async function deleteComment(commentId) {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return;
    try {
      await apiFetch(`/api/posts/comment/${commentId}/delete/`, { method: 'DELETE' });
      loadPosts(true);
    } catch (error) {
      alert('Erro ao excluir o comentário.');
    }
  };

  window.enablePostEdit = function enablePostEdit(postId) {
    const contentDiv = document.getElementById(`post-text-content-${postId}`);
    const originalText = contentDiv.getAttribute('data-raw') || '';
    contentDiv.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${postId}" class="form-control custom-input w-100" rows="3" maxlength="200">${originalText}</textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" type="button" onclick="savePostEdit(${postId})">Salvar</button>
          <button class="btn btn-sm btn-secondary" type="button" onclick="loadPosts(true)">Cancelar</button>
        </div>
      </div>`;
  };

  window.savePostEdit = async function savePostEdit(postId) {
    const content = document.getElementById(`edit-post-input-${postId}`).value.trim();
    if (!content) return;
    try {
      const response = await apiFetch(`/api/posts/post/${postId}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      if (response.ok) loadPosts(true);
      else alert('Erro ao editar o post. Verifique o limite de 200 caracteres.');
    } catch (error) {
      console.error(error);
    }
  };

  window.enableCommentEdit = function enableCommentEdit(commentId) {
    const textSpan = document.getElementById(`comment-text-content-${commentId}`);
    const originalText = textSpan.getAttribute('data-raw') || '';
    textSpan.innerHTML = `
      <span class="comment-edit-inline">
        <input type="text" id="edit-comment-input-${commentId}" class="form-control form-control-sm custom-input" maxlength="200" value="${originalText}">
        <button class="btn btn-sm btn-primary" type="button" onclick="saveCommentEdit(${commentId})">Salvar</button>
        <button class="btn btn-sm btn-secondary" type="button" onclick="loadPosts(true)">✕</button>
      </span>`;
  };

  window.saveCommentEdit = async function saveCommentEdit(commentId) {
    const content = document.getElementById(`edit-comment-input-${commentId}`).value.trim();
    if (!content) return;
    try {
      const response = await apiFetch(`/api/posts/comment/${commentId}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      if (response.ok) loadPosts(true);
      else alert('Erro ao editar o comentário.');
    } catch (error) {
      console.error(error);
    }
  };

  if (publishBtn) {
    publishBtn.addEventListener('click', async () => {
      const content = postInput.value.trim();
      if (!content) return;
      publishBtn.disabled = true;
      publishBtn.textContent = 'Publicando...';
      try {
        const response = await apiFetch('/api/posts/feed/create/', {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
        if (!response.ok) throw new Error('Erro ao publicar.');
        postInput.value = '';
        bootstrap.Modal.getInstance(document.getElementById('newPostModal'))?.hide();
        setActiveTab('general');
        loadPosts(true);
      } catch (error) {
        alert('Erro ao publicar.');
      } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = 'Publicar';
      }
    });
  }

  window.toggleLike = async function toggleLike(postId, btnElement) {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    const data = await response.json();
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data.liked);
    if (svg) svg.style.fill = data.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.like-count').textContent = data.total_likes;
  };

  window.addComment = async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/post/${postId}/comment/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response.ok) {
      input.value = '';
      loadPosts(true);
    } else {
      alert('Erro ao comentar.');
    }
  };

  window.toggleCommentLike = async function toggleCommentLike(commentId, btnElement) {
    const response = await apiFetch(`/api/posts/comment/${commentId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    const data = await response.json();
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data.liked);
    if (svg) svg.style.fill = data.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.comment-like-count').textContent = data.total_likes;
  };

  window.toggleReplyInput = function toggleReplyInput(commentId) {
    const box = document.getElementById(`reply-box-${commentId}`);
    box.classList.toggle('d-none');
    if (!box.classList.contains('d-none')) document.getElementById(`reply-input-${commentId}`)?.focus();
  };

  window.addReply = async function addReply(commentId) {
    const input = document.getElementById(`reply-input-${commentId}`);
    const content = input.value.trim();
    if (!content) return;
    const response = await apiFetch(`/api/posts/comment/${commentId}/reply/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response.ok) {
      input.value = '';
      loadPosts(true);
    } else {
      alert('Erro ao responder.');
    }
  };

  generalTab?.addEventListener('click', () => {
    setActiveTab('general');
    loadPosts();
  });

  friendsTab?.addEventListener('click', () => {
    setActiveTab('friends');
    loadPosts();
  });

  setActiveTab('general');
  loadPosts();
});
