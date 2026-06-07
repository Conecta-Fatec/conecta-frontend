/* =========================================================
   Post único: publicação completa, comentários e respostas
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('id');
  const commSlug = urlParams.get('comm');

  if (!postId) {
    window.location.href = 'feed.html';
    return;
  }

  const mainPostContainer = document.getElementById('main-post-container');
  const commentsList = document.getElementById('post-comments-list');
  const refreshCommentsBtn = document.getElementById('refreshPostCommentsBtn');

  let rootCommentsVisible = 5;
  let currentUser = getLoggedUserFromStorage();

  try {
    currentUser = await loadLoggedUser() || currentUser;
    if (window.ConectaPosts) {
      window.ConectaPosts.currentUser = currentUser;
      window.ConectaPosts.currentUserNickname = currentUser?.nickname || '';
    }
  } catch (error) {
    console.error(error);
  }

  async function fetchPostData(id, slug) {
    const endpoints = [];


    for (const endpoint of endpoints) {
      try {
        const response = await apiFetch(endpoint);
        if (response.ok) return await response.json();
      } catch (error) {}
    }

    try {
      const response = await apiFetch(slug ? `/api/posts/communities/${slug}/` : '/api/posts/feed/');
      if (response.ok) {
        const data = await response.json();
        const posts = slug
          ? normalizeArray(data.posts, 'results', 'items')
          : normalizeArray(data, 'posts', 'results', 'feed', 'items');
        const found = posts.find((post) => String(post.id) === String(id));
        if (found) return found;
      }
    } catch (error) {}

    throw new Error('Publicação não encontrada ou excluída.');
  }

  function renderMoreCommentsButton(totalComments) {
    const remaining = totalComments - rootCommentsVisible;
    if (remaining <= 0) return '';

    return `
      <div class="post-comments-more">
        <button class="btn btn-outline-primary rounded-pill fw-bold px-4" onclick="window.loadMoreRootComments()" type="button">
          Ver mais comentários (${Math.min(5, remaining)})
        </button>
      </div>
    `;
  }

  window.loadMoreRootComments = function() {
    rootCommentsVisible += 5;
    window.loadSinglePost(true);
  };

  window.loadSinglePost = async function loadSinglePost(silent = false) {
    try {
      if (!silent) {
        mainPostContainer.innerHTML = '<p class="text-center text-muted py-4">Carregando publicação...</p>';
        commentsList.innerHTML = '';
      }

      const postData = await fetchPostData(postId, commSlug);

      mainPostContainer.innerHTML = ConectaPosts.renderPostCard(postData, {
        currentUser,
        showCommunityLabel: true,
        canInteract: true,
        isSingleView: true,
        showFullPostButton: false,
      });

      const commentsTree = ConectaPosts.buildCommentsTree(postData);

      if (!commentsTree.length) {
        commentsList.innerHTML = '<p class="post-comments-empty">Nenhum comentário ainda. Seja o primeiro a comentar.</p>';
        return;
      }

      const visibleComments = commentsTree.slice(0, rootCommentsVisible);
      const commentsHTML = visibleComments.map((comment) => ConectaPosts.renderComment(comment, {
        currentUser,
        canInteract: true,
        allowCommentInput: true,
        replyLimit: 1,
      })).join('');

      commentsList.innerHTML = commentsHTML + renderMoreCommentsButton(commentsTree.length);
    } catch (error) {
      console.error(error);
      if (!silent) {
        mainPostContainer.innerHTML = `<p class="text-center text-danger py-5 m-0">${escapeHTML(error.message)}</p>`;
        commentsList.innerHTML = '';
      }
    }
  };

  window.deletePost = async function(id, btnElement) {
    if (!confirm('Tem certeza que deseja excluir este post?')) return;
    if (btnElement) window.travarBotao(btnElement);
    try {
      const response = await apiFetch(`/api/posts/post/${id}/delete/`, { method: 'DELETE' });
      if (response.ok) window.location.href = 'feed.html';
    } finally {
      if (btnElement) window.destravarBotao(btnElement);
    }
  };

  window.toggleLike = async function(id, btnElement) {
    if (btnElement && !window.travarBotao(btnElement, false)) return;
    try {
      const response = await apiFetch(`/api/posts/post/${id}/like/`, { method: 'POST' });
      if (!response.ok) return;

      const data = await response.json().catch(() => null);
      const liked = Boolean(data?.liked);
      const svg = btnElement.querySelector('svg');

      btnElement.classList.toggle('liked', liked);
      btnElement.classList.toggle('text-primary-custom', liked);
      if (svg) svg.style.fill = liked ? 'currentColor' : 'none';

      const count = btnElement.querySelector('.like-count');
      if (count) count.textContent = data?.total_likes ?? data?.likes_count ?? 0;
    } finally {
      if (btnElement) window.destravarBotao(btnElement, false);
    }
  };

  window.enablePostEdit = function(id) {
    const container = document.getElementById(`post-text-content-${id}`);
    if (!container) return;

    const text = container.querySelector('.post-text')?.textContent || container.dataset.raw || '';
    container.innerHTML = `
      <div class="mb-3 mt-2">
        <textarea id="edit-post-input-${id}" class="form-control custom-input w-100" rows="3" data-character-limit="200"></textarea>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" onclick="savePostEdit(${id}, this)" type="button">Salvar</button>
          <button class="btn btn-sm btn-secondary" onclick="loadSinglePost(true)" type="button">Cancelar</button>
        </div>
      </div>
    `;
    const editInput = document.getElementById(`edit-post-input-${id}`);
    editInput.value = text;
    if (window.ConectaCharCounter) window.ConectaCharCounter.attach(editInput, 200);
  };

  window.savePostEdit = async function(id, btnElement) {
    const editInput = document.getElementById(`edit-post-input-${id}`);
    const content = editInput?.value.trim();
    if (!content) return;
    if (window.ConectaCharCounter && !window.ConectaCharCounter.validateOrShow(editInput, null, 'post')) { alert('O post pode ter no máximo 200 caracteres.'); return; }
    if (btnElement && !window.travarBotao(btnElement, true)) return;

    try {
      const response = await apiFetch(`/api/posts/post/${id}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      if (response.ok) await loadSinglePost(true);
    } finally {
      if (btnElement) window.destravarBotao(btnElement, true);
    }
  };

  window.toggleCommentLike = async function(id, btnElement) {
    if (btnElement && !window.travarBotao(btnElement, false)) return;
    try {
      const response = await apiFetch(`/api/posts/comment/${id}/like/`, { method: 'POST' });
      if (!response.ok) return;

      const data = await response.json().catch(() => null);
      const liked = Boolean(data?.liked);
      const svg = btnElement.querySelector('svg');

      btnElement.classList.toggle('liked', liked);
      btnElement.classList.toggle('text-primary-custom', liked);
      if (svg) {
        svg.style.fill = liked ? 'currentColor' : 'none';
        svg.style.stroke = liked ? 'none' : 'currentColor';
      }

      const count = btnElement.querySelector('.comment-like-count');
      if (count) count.textContent = data?.total_likes ?? data?.likes_count ?? 0;
    } finally {
      if (btnElement) window.destravarBotao(btnElement, false);
    }
  };

  window.deleteComment = async function(id, btnElement) {
    if (!confirm('Excluir este comentário?')) return;
    if (btnElement) window.travarBotao(btnElement);
    try {
      const response = await apiFetch(`/api/posts/comment/${id}/delete/`, { method: 'DELETE' });
      if (response.ok) await loadSinglePost(true);
    } finally {
      if (btnElement) window.destravarBotao(btnElement);
    }
  };

  window.enableCommentEdit = function(id) {
    const container = document.getElementById(`comment-text-content-${id}`);
    if (!container) return;

    const text = container.querySelector('.tw-text')?.textContent || container.dataset.raw || '';
    container.innerHTML = `
      <div class="comment-edit-inline mt-2">
        <input type="text" id="edit-comment-input-${id}" class="form-control form-control-sm custom-input" data-character-limit="200">
        <button class="btn btn-sm btn-primary" onclick="saveCommentEdit(${id}, this)" type="button">Salvar</button>
        <button class="btn btn-sm btn-secondary" onclick="loadSinglePost(true)" type="button">Cancelar</button>
      </div>
    `;
    const editCommentInput = document.getElementById(`edit-comment-input-${id}`);
    editCommentInput.value = text;
    if (window.ConectaCharCounter) window.ConectaCharCounter.attach(editCommentInput, 200);
  };

  window.saveCommentEdit = async function(id, btnElement) {
    const editCommentInput = document.getElementById(`edit-comment-input-${id}`);
    const content = editCommentInput?.value.trim();
    if (!content) return;
    if (window.ConectaCharCounter && !window.ConectaCharCounter.validateOrShow(editCommentInput, null, 'comentário')) { alert('O comentário pode ter no máximo 200 caracteres.'); return; }
    if (btnElement && !window.travarBotao(btnElement, true)) return;

    try {
      const response = await apiFetch(`/api/posts/comment/${id}/update/`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      if (response.ok) await loadSinglePost(true);
    } finally {
      if (btnElement) window.destravarBotao(btnElement, true);
    }
  };

  refreshCommentsBtn?.addEventListener('click', async () => {
    const icon = refreshCommentsBtn.querySelector('.refresh-icon');
    if (icon) icon.classList.add('spin-animation');
    refreshCommentsBtn.disabled = true;
    await loadSinglePost(true);
    refreshCommentsBtn.disabled = false;
    if (icon) icon.classList.remove('spin-animation');
  });

  loadSinglePost();
});
