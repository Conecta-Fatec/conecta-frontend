document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const postsContainer = document.getElementById('posts-container');
  const generalTab = document.getElementById('general-tab');
  const friendsTab = document.getElementById('friends-tab');
  const publishBtn = document.getElementById('publishBtn');
  const postInput = document.getElementById('postContent');
  const inlineComposer = document.getElementById('feed-create-post-card');
  let currentUser = getLoggedUserFromStorage();
  let currentMode = 'general';
  let cachedFriends = { ids: new Set(), nicknames: new Set() };

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

  function normalizePostsPayload(data) {
    return normalizeArray(data, 'posts', 'results', 'feed', 'items');
  }

  async function loadFriendsIndex() {
    if (cachedFriends.ids?.size || cachedFriends.nicknames?.size) return cachedFriends;

    try {
      const data = await apiJSON('/api/users/friends/');
      const friends = normalizeArray(data, 'friends', 'results');
      cachedFriends = {
        ids: new Set(friends.map((friend) => Number(friend.id)).filter(Number.isFinite)),
        nicknames: new Set(friends.map((friend) => friend.nickname).filter(Boolean)),
      };
    } catch (error) {
      console.error('Erro ao carregar amigos para filtrar o feed:', error);
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

  async function fetchFriendsPostsWithFallback() {
    // O backend atualizado deve responder esta rota. Se ela ainda não existir no deploy,
    // filtramos no front usando a lista oficial de amigos do usuário.
    try {
      const data = await apiJSON('/api/posts/feed/friends/');
      return normalizePostsPayload(data);
    } catch (error) {
      if (!error.response || ![404, 405].includes(error.response.status)) {
        console.error('Erro ao buscar feed de amigos no backend:', error);
      }

      const [allPosts, friendsIndex] = await Promise.all([
        apiJSON('/api/posts/feed/').then(normalizePostsPayload),
        loadFriendsIndex(),
      ]);

      return allPosts.filter((post) => isPostFromFriend(post, friendsIndex));
    }
  }

  async function fetchPosts(mode) {
    if (mode === 'friends') return fetchFriendsPostsWithFallback();
    return normalizePostsPayload(await apiJSON('/api/posts/feed/'));
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

  function renderPostActions(post, isOwner) {
    return `
      <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleLike(${post.id}, this)" type="button" aria-label="Curtir publicação">
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${post.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="like-count">${postLikesCount(post)}</span>
      </button>
      <button class="post-action-btn" onclick="document.getElementById('comment-input-${post.id}')?.focus()" type="button" aria-label="Comentar publicação">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6A3.5 3.5 0 0 1 16.5 15H10l-5.5 5v-5A3.5 3.5 0 0 1 1 11.5v-6Z" />
        </svg>
        <span>${postCommentsCount(post)}</span>
      </button>
      ${isOwner ? `
        <button class="post-action-btn owner-action" onclick="enablePostEdit(${post.id})" type="button">Editar</button>
        <button class="post-action-btn owner-action delete-action text-danger" onclick="deletePost(${post.id})" type="button">Excluir</button>
      ` : ''}
    `;
  }

  function commentHeaderHTML(author) {
    const nickname = author.nickname || 'usuario';
    return `
      <span class="comment-meta">
        ${userLinkHTML(author, userDisplayName(author), 'comment-author')}
        <span class="comment-username">@${escapeHTML(nickname)}</span>
      </span>
    `;
  }

  function renderComments(comments = [], level = 0) {
    if (!comments.length) return '';

    return comments.map((comment) => {
      const author = comment.author || {};
      const isOwner = author.nickname === currentUser?.nickname;
      const replies = getCommentReplies(comment);
      const replyLabel = replies.length || comment.replies_count || 0;

      return `
        <div class="post-comment ${level > 0 ? 'comment-reply' : ''}">
          <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author, 'comment-avatar')}</a>
          <div class="comment-body">
            <p class="comment-text-line">
              ${commentHeaderHTML(author)}
              <span id="comment-text-content-${comment.id}" class="comment-content" data-raw="${escapeHTML(comment.content)}">${escapeHTML(comment.content)}</span>
              ${comment.edited ? '<small class="text-muted">(editado)</small>' : ''}
            </p>
            <div class="comment-actions">
              <button class="comment-action ${comment.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleCommentLike(${comment.id}, this)" type="button">
                <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${comment.liked_by_me ? 'currentColor' : 'none'};">
                  <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
                </svg>
                <span class="comment-like-count">${comment.total_likes ?? comment.likes_count ?? 0}</span>
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
            ${replies.length ? `<div class="comment-replies">${renderComments(replies, level + 1)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPostCommunityLabel(post) {
    const community = post.community || post.community_data || null;
    if (!community) return '';
    const slug = community.slug || post.community_slug;
    const name = community.name || post.community_name || 'comunidade';
    if (!slug) return `<span class="post-community-chip">Publicado em ${escapeHTML(name)}</span>`;
    return `<a href="community.html?slug=${encodeURIComponent(slug)}" class="post-community-chip">Publicado em ${escapeHTML(name)}</a>`;
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
      const comments = getPostComments(post);
      const when = relativeTime(post.created_at || post.updated_at, 'feito');
      const communityLabel = renderPostCommunityLabel(post);

      postsContainer.insertAdjacentHTML('beforeend', `
        <article class="post-card">
          <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author)}</a>
          <div class="post-body" style="min-width:0;">
            <div class="post-header">
              <div class="text-truncate">
                ${userLinkHTML(author, authorName, 'post-author')}
                <span>@${escapeHTML(author.nickname || 'usuario')} ${when ? `· ${escapeHTML(when)}` : ''} ${post.edited ? '· <small>(editado)</small>' : ''}</span>
              </div>
            </div>
            ${communityLabel}
            <div id="post-text-content-${post.id}" data-raw="${escapeHTML(post.content)}">
              <p class="post-text">${escapeHTML(post.content)}</p>
            </div>
            <div class="post-actions">${renderPostActions(post, isOwner)}</div>
            <div class="comments-section mt-2">
              ${renderComments(comments)}
              <div class="comment-input-row mt-3">
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

  async function publishFeedPost() {
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
  }

  if (publishBtn) publishBtn.addEventListener('click', publishFeedPost);

  inlineComposer?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newPostModal')).show();
    }
  });

  function setupMobileComposeButton() {
    if (!document.body || document.querySelector('.mobile-compose-fab')) return;
    const button = document.createElement('button');
    button.className = 'mobile-compose-fab';
    button.type = 'button';
    button.setAttribute('aria-label', 'Criar post');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>';
    button.addEventListener('click', () => bootstrap.Modal.getOrCreateInstance(document.getElementById('newPostModal')).show());
    document.body.appendChild(button);
  }

  setupMobileComposeButton();

  window.toggleLike = async function toggleLike(postId, btnElement) {
    const response = await apiFetch(`/api/posts/post/${postId}/like/`, { method: 'POST' });
    if (!response.ok) return;
    const data = await response.json();
    const svg = btnElement.querySelector('svg');
    btnElement.classList.toggle('text-primary-custom', !!data.liked);
    if (svg) svg.style.fill = data.liked ? 'currentColor' : 'none';
    btnElement.querySelector('.like-count').textContent = data.total_likes ?? data.likes_count ?? 0;
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
    btnElement.querySelector('.comment-like-count').textContent = data.total_likes ?? data.likes_count ?? 0;
  };

  window.toggleReplyInput = function toggleReplyInput(commentId) {
    const box = document.getElementById(`reply-box-${commentId}`);
    box?.classList.toggle('d-none');
    if (box && !box.classList.contains('d-none')) document.getElementById(`reply-input-${commentId}`)?.focus();
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
