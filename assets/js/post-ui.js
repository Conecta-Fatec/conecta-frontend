/* =========================================================
   ConectaPosts: renderização de posts, comentários e respostas
   - Cards abrem preview inline de comentários
   - Comentário/resposta usam modal único
   - Threads exibem linha apenas dentro do mesmo comentário
========================================================= */
(function () {
  window.ConectaPosts = window.ConectaPosts || {};
  window.ConectaPosts.postCache = window.ConectaPosts.postCache || new Map();
  window.replyPagination = window.replyPagination || new Map();

  const ICONS = {
    likeOutline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" /></svg>',
    likeSolid: '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill: currentColor; stroke: none;"><path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>'
  };

  function getCommentReplies(comment = {}) {
    const replies = comment.replies || comment.children || comment.answers || [];
    return Array.isArray(replies) ? replies : normalizeArray(replies, 'results', 'items');
  }

  function getParentId(comment = {}) {
    const parent = comment.parent || comment.parent_id || comment.reply_to || comment.reply_to_id;
    if (!parent) return null;
    if (typeof parent === 'object') return parent.id || parent.pk || null;
    return parent;
  }

  function uniqueCommentKey(comment = {}) {
    return String(comment.id ?? comment.pk ?? `${comment.author?.nickname || 'u'}-${comment.created_at || ''}-${comment.content || ''}`);
  }

  function collectComments(comments = [], map = new Map(), parent = null) {
    comments.forEach((comment) => {
      if (!comment) return;

      const key = uniqueCommentKey(comment);
      const parentId = parent?.id || parent?.pk || null;
      const normalized = { ...comment, replies: [] };

      // Algumas respostas vêm apenas aninhadas, sem parent_id explícito.
      // Nesse caso preservamos a herança pelo comentário/resposta onde ela veio.
      if (parentId && !getParentId(normalized)) normalized.parent_id = parentId;

      if (map.has(key)) {
        const existing = map.get(key);
        if (!getParentId(existing) && getParentId(normalized)) existing.parent_id = getParentId(normalized);
      } else {
        map.set(key, normalized);
      }

      getCommentReplies(comment).forEach((reply) => collectComments([reply], map, normalized));
    });
    return map;
  }

  function sortByDate(items = []) {
    return items.sort((a, b) => {
      const first = new Date(a.created_at || a.updated_at || 0).getTime();
      const second = new Date(b.created_at || b.updated_at || 0).getTime();
      return (Number.isFinite(first) ? first : 0) - (Number.isFinite(second) ? second : 0);
    });
  }

  function buildCommentsTree(post = {}) {
    const topLevel = normalizeArray(post.top_level_comments, 'results', 'items');
    const allComments = normalizeArray(post.comments, 'results', 'items');
    const map = collectComments([...topLevel, ...allComments]);

    if (!map.size) return [];

    const roots = [];
    map.forEach((comment) => {
      const parentId = getParentId(comment);
      const parent = parentId ? map.get(String(parentId)) : null;
      if (parent && parent.id !== comment.id) parent.replies.push(comment);
      else roots.push(comment);
    });

    map.forEach((comment) => sortByDate(comment.replies));
    return sortByDate(roots);
  }

  function flattenReplies(comment = {}) {
    const result = [];

    const walk = (items = [], parentAuthor = null) => {
      items.forEach((item) => {
        const reply = { ...item, parentAuthor };
        result.push(reply);
        const replies = getCommentReplies(item);
        if (replies.length) walk(replies, item.author || parentAuthor);
      });
    };

    walk(getCommentReplies(comment), comment.author || null);
    return result;
  }

  function authorNickname(author = {}) {
    return author.nickname || author.username || 'usuario';
  }

  // =======================================================
  // Textos compactos para cabeçalhos responsivos
  // =======================================================
  const HEADER_TEXT_LIMIT = 20;

  function truncateHeaderText(value = '', limit = HEADER_TEXT_LIMIT) {
    const text = String(value || '').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
  }

  function headerDisplayName(author = {}) {
    return truncateHeaderText(userDisplayName(author));
  }

  function headerNickname(author = {}) {
    return truncateHeaderText(authorNickname(author));
  }

  function safeCompactTime(value) {
    if (typeof compactRelativeTime === 'function') return compactRelativeTime(value);
    return relativeTime(value, '').replace('há ', '').replace(' min', 'm').replace(/ dias?/, 'd').trim();
  }

  function renderThreadItem(item, options, isReply = false, parentAuthor = null, hasNext = false) {
    const author = item.author || {};
    const currentNickname = options.currentUser?.nickname || window.ConectaPosts.currentUserNickname || '';
    const isOwner = Boolean(author.nickname && author.nickname === currentNickname);
    const canInteract = options.canInteract !== false && options.showActions !== false;
    const rawDate = item.created_at || item.updated_at;
    const when = relativeTime(rawDate, '');
    const whenCompact = safeCompactTime(rawDate);
    const likeIcon = item.liked_by_me ? ICONS.likeSolid : ICONS.likeOutline;
    const likesCount = item.total_likes ?? item.likes_count ?? item.likes ?? 0;
    const parentNick = parentAuthor ? headerNickname(parentAuthor) : '';
    const fullName = userDisplayName(author);
    const shortName = headerDisplayName(author);
    const nick = headerNickname(author);

    return `
      <div class="tw-comment-wrapper ${isReply ? 'tw-reply-wrapper' : 'tw-root-comment-wrapper'}">
        <div class="tw-avatar-col">
          <a href="${profileUrlFor(author)}" class="tw-avatar-link" onclick="event.stopPropagation()">
            ${avatarHTML(author, 'comment-avatar')}
          </a>
          ${hasNext ? '<div class="tw-thread-line"></div>' : ''}
        </div>

        <div class="tw-content-col">
          <div class="tw-header">
            <a href="${profileUrlFor(author)}" class="tw-author-name" onclick="event.stopPropagation()" title="${escapeHTML(fullName)}">${escapeHTML(shortName)}</a>
            ${isReply && parentAuthor ? `
              <span class="tw-reply-arrow" aria-hidden="true">›</span>
              <a href="${profileUrlFor(parentAuthor)}" class="tw-reply-target" onclick="event.stopPropagation()" title="@${escapeHTML(authorNickname(parentAuthor))}">@${escapeHTML(parentNick)}</a>
            ` : `
              <a href="${profileUrlFor(author)}" class="tw-username" onclick="event.stopPropagation()" title="@${escapeHTML(authorNickname(author))}">@${escapeHTML(nick)}</a>
            `}
            ${when ? `<span class="tw-date" title="${escapeHTML(when)}"> · <span class="date-full">${escapeHTML(when)}</span><span class="date-short">${escapeHTML(whenCompact)}</span></span>` : ''}
            ${item.edited ? '<span class="tw-date"> · editado</span>' : ''}
          </div>

          <div id="comment-text-content-${item.id}" data-raw="${escapeHTML(item.content || '')}">
            <p class="tw-text">${escapeHTML(item.content || '')}</p>
          </div>

          ${canInteract ? `
            <div class="tw-actions thread-actions">
              <button class="post-action-btn thread-like-btn ${item.liked_by_me ? 'liked text-primary-custom' : ''}" onclick="event.stopPropagation(); toggleCommentLike(${item.id}, this)" type="button" aria-label="Curtir comentário">
                ${likeIcon}
                <span class="comment-like-count">${likesCount}</span>
              </button>

              <button class="thread-text-action" onclick="openCommentReplyBox(event, ${item.id})" type="button">Responder</button>

              ${isOwner ? `
                <button class="thread-text-action" onclick="event.stopPropagation(); enableCommentEdit(${item.id})" type="button">Editar</button>
                <button class="thread-text-action delete-action" onclick="event.stopPropagation(); deleteComment(${item.id})" type="button">Excluir</button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderComment(comment = {}, options = {}) {
    const replies = flattenReplies(comment);
    const defaultLimit = options.replyLimit !== undefined ? options.replyLimit : replies.length;
    const customizedVisible = window.replyPagination.get(comment.id);
    const visibleCount = Number.isFinite(Number(customizedVisible)) ? Number(customizedVisible) : defaultLimit;
    const clampedVisible = Math.min(visibleCount, replies.length);
    const visibleReplies = replies.slice(0, clampedVisible);
    const thread = [comment, ...visibleReplies];

    let html = '<div class="tw-thread-container">';
    html += thread.map((item, index) => {
      const isReply = item.id !== comment.id;
      const hasNext = index < thread.length - 1;
      return renderThreadItem(item, options, isReply, item.parentAuthor || null, hasNext);
    }).join('');

    if (!options.hideReplyPagination && replies.length > defaultLimit) {
      const remaining = replies.length - clampedVisible;
      const canHide = clampedVisible > defaultLimit;

      if (remaining > 0 || canHide) {
        html += '<div class="tk-replies-actions">';
        html += '<span class="tk-replies-line" aria-hidden="true"></span>';
        if (remaining > 0) {
          const nextAmount = Math.min(3, remaining);
          html += `<button class="tk-replies-btn" onclick="event.stopPropagation(); window.loadMoreReplies(${comment.id})" type="button">Ver mais respostas (${nextAmount})</button>`;
        }
        if (canHide) {
          html += `<button class="tk-replies-btn" onclick="event.stopPropagation(); window.hideReplies(${comment.id}, ${defaultLimit})" type="button">Ocultar respostas</button>`;
        }
        html += '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  function renderCommunityChip(post = {}) {
    const community = post.community || post.community_data || null;
    const slug = community?.slug || post.community_slug;
    const name = community?.name || post.community_name;
    if (!name) return '<span class="post-community-chip">Feito no feed</span>';
    if (!slug) return `<span class="post-community-chip">Feito em ${escapeHTML(name)}</span>`;
    return `<a href="community.html?slug=${encodeURIComponent(slug)}" class="post-community-chip" onclick="event.stopPropagation()">Feito em ${escapeHTML(name)}</a>`;
  }

  function postLinkFor(post = {}) {
    const pageSlug = new URLSearchParams(window.location.search).get('slug');
    const commObj = post.community || post.community_data || null;
    const commSlug = commObj?.slug || post.community_slug || pageSlug || '';
    return commSlug ? `post.html?id=${post.id}&comm=${encodeURIComponent(commSlug)}` : `post.html?id=${post.id}`;
  }

  function renderPostActions(post = {}, isOwner = false, options = {}) {
    const disabled = options.canInteract === false;
    const likesCount = postLikesCount(post);
    const commentsCount = postCommentsCount(post);

    return `
      <button class="post-action-btn ${post.liked_by_me ? 'liked text-primary-custom' : ''}" onclick="event.stopPropagation(); toggleLike(${post.id}, this)" type="button" aria-label="Curtir publicação" ${disabled ? 'disabled title="Entre para interagir"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${post.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="like-count">${likesCount}</span>
      </button>

      <button class="post-action-btn" onclick="openPostCommentBox(event, ${post.id})" type="button" aria-label="Comentar publicação" ${disabled ? 'disabled title="Entre para comentar"' : ''}>
        ${ICONS.comment}
        <span>${commentsCount}</span>
      </button>

      ${isOwner ? `
        <button class="post-action-btn owner-action" onclick="event.stopPropagation(); enablePostEdit(${post.id})" type="button">Editar</button>
        <button class="post-action-btn owner-action delete-action" onclick="event.stopPropagation(); deletePost(${post.id})" type="button">Excluir</button>
      ` : ''}
    `;
  }

  function inlinePreviewOptionsFromCard(card) {
    const canInteract = card?.dataset?.canInteract !== 'false';
    return {
      currentUser: window.ConectaPosts.currentUser || null,
      canInteract,
      allowCommentInput: canInteract,
      replyLimit: 1,
    };
  }

  // Usa o post que já veio da listagem para evitar chamadas extras e 404 em rotas inexistentes.
  async function fetchPostForInlinePreview(postId, cachedPost = {}) {
    return cachedPost && Object.keys(cachedPost).length
      ? cachedPost
      : { id: postId, comments: [], top_level_comments: [] };
  }

  function renderInlineCommentsPreview(post = {}, options = {}) {
    const commentsTree = buildCommentsTree(post);
    const visibleComments = commentsTree.slice(0, 2);
    const postLink = postLinkFor(post);

    const commentsHTML = visibleComments.length
      ? visibleComments.map((comment) => renderComment(comment, {
          ...options,
          replyLimit: 1,
          hideReplyPagination: true,
        })).join('')
      : '<p class="inline-comments-empty">Nenhum comentário ainda.</p>';

    return `
      <div class="inline-comments-wrapper" onclick="event.stopPropagation()">
        <div class="inline-comments-list">
          ${commentsHTML}
        </div>

        <div class="inline-post-actions">
          <a href="${escapeHTML(postLink)}" class="post-full-link inline-post-full-link" onclick="event.stopPropagation()">
            Ver post completo
          </a>

          <button class="tk-replies-btn inline-close-btn" onclick="event.stopPropagation(); window.ConectaPosts.closeInlineComments(${post.id})" type="button">
            Fechar
          </button>
        </div>
      </div>
    `;
  }

  function renderPostCard(post = {}, options = {}) {
    window.ConectaPosts.postCache.set(String(post.id), post);

    const author = options.author || post.author || {};
    const currentUser = options.currentUser || null;
    const isOwner = Boolean(author.nickname && author.nickname === currentUser?.nickname);
    const rawDate = post.created_at || post.updated_at;
    const when = relativeTime(rawDate, 'feito');
    const whenCompact = safeCompactTime(rawDate);
    const postLink = postLinkFor(post);
    const fullName = userDisplayName(author);
    const shortName = headerDisplayName(author);
    const nick = headerNickname(author);
    const canOpenCard = options.isSingleView !== true && options.disableCardLink !== true;
    const cardClick = canOpenCard ? `onclick="window.ConectaPosts.handlePostCardClick(event, ${post.id})"` : '';
    const shouldShowFullButton = options.showFullPostButton === true && !options.isSingleView;

    return `
      <article class="post-card ${canOpenCard ? 'post-card-clickable' : ''}" id="post-${post.id}" data-post-url="${escapeHTML(postLink)}" data-can-interact="${options.canInteract === false ? 'false' : 'true'}" ${cardClick}>
        <a href="${profileUrlFor(author)}" class="avatar-link" onclick="event.stopPropagation()">${avatarHTML(author)}</a>
        <div class="post-body" style="min-width:0;">
          <div class="post-header">
            <div class="post-header-main">
              <a href="${profileUrlFor(author)}" class="post-author" onclick="event.stopPropagation()" title="${escapeHTML(fullName)}">${escapeHTML(shortName)}</a>
              <a href="${profileUrlFor(author)}" class="post-username text-decoration-none" onclick="event.stopPropagation()" title="@${escapeHTML(author.nickname || author.username || 'usuario')}">@${escapeHTML(nick)}</a>
              ${when ? `<a href="${postLink}" class="post-date-link text-muted text-decoration-none" onclick="event.stopPropagation()" title="${escapeHTML(when)}"><span class="date-full"> · ${escapeHTML(when)}</span><span class="date-short"> · ${escapeHTML(whenCompact)}</span></a>` : ''}
              ${post.edited ? '<small class="post-edited-label"> · editado</small>' : ''}
            </div>
          </div>
          ${options.showCommunityLabel ? renderCommunityChip(post) : ''}
          <div id="post-text-content-${post.id}" data-raw="${escapeHTML(post.content || '')}"><p class="post-text">${escapeHTML(post.content || '')}</p></div>
          <div class="post-actions">${renderPostActions(post, isOwner, options)}</div>
          <div class="inline-comments-placeholder" id="inline-comments-${post.id}"></div>
          ${shouldShowFullButton ? `<a href="${postLink}" class="post-full-link" onclick="event.stopPropagation()">Ver post completo</a>` : ''}
        </div>
      </article>
    `;
  }

  window.ConectaPosts.closeInlineComments = function(postId) {
    const card = document.getElementById(`post-${postId}`);
    if (!card) return;

    const placeholder = card.querySelector(`#inline-comments-${postId}`);
    if (!placeholder) return;

    placeholder.classList.remove('is-open');
    placeholder.innerHTML = '';

    card.classList.remove('post-card-highlight');
    card.dataset.inlineLoading = 'false';
  };

  window.ConectaPosts.handlePostCardClick = async function(event, postId) {
    if (event) {
      const interactiveTarget = event.target.closest('a, button, input, textarea, select, label, .comment-edit-inline, .inline-comments-wrapper');
      if (interactiveTarget) return;
      event.preventDefault();
      event.stopPropagation();
    }

    const card = document.getElementById(`post-${postId}`);
    if (!card || card.dataset.inlineLoading === 'true') return;

    const placeholder = card.querySelector(`#inline-comments-${postId}`);
    if (!placeholder) return;

    if (placeholder.classList.contains('is-open')) {
      window.ConectaPosts.closeInlineComments(postId);
      return;
    }

    card.dataset.inlineLoading = 'true';
    card.classList.add('post-card-highlight');
    placeholder.classList.add('is-open');
    placeholder.innerHTML = '<p class="inline-comments-loading">Carregando comentários...</p>';

    try {
      const cachedPost = window.ConectaPosts.postCache.get(String(postId)) || { id: postId };
      const post = await fetchPostForInlinePreview(postId, cachedPost);
      window.ConectaPosts.postCache.set(String(postId), post);
      placeholder.innerHTML = renderInlineCommentsPreview(post, inlinePreviewOptionsFromCard(card));
    } catch (error) {
      console.error(error);
      placeholder.innerHTML = `
        <div class="inline-comments-wrapper" onclick="event.stopPropagation()">
          <p class="inline-comments-empty">Não foi possível carregar os comentários agora.</p>
          <div class="inline-post-actions">
            <a href="${escapeHTML(card.dataset.postUrl || '#')}" class="post-full-link inline-post-full-link" onclick="event.stopPropagation()">Ver post completo</a>
            <button class="tk-replies-btn inline-close-btn" onclick="event.stopPropagation(); window.ConectaPosts.closeInlineComments(${postId})" type="button">Fechar</button>
          </div>
        </div>
      `;
    } finally {
      card.dataset.inlineLoading = 'false';
    }
  };

  function ensureInteractionModal() {
    let modal = document.getElementById('postInteractionModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'postInteractionModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content post-modal-content">
          <div class="modal-header post-modal-header">
            <h2 class="modal-title fs-5" id="postInteractionTitle">Comentar</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body post-modal-body">
            <div class="create-post-modal-area">
              <div class="user-avatar" id="postInteractionAvatar">U</div>
              <textarea id="postInteractionContent" rows="5" maxlength="280" placeholder="Comente este post."></textarea>
            </div>
            <p class="text-danger small mt-3 mb-0" id="postInteractionError" style="display:none;"></p>
          </div>
          <div class="modal-footer post-modal-footer">
            <button type="button" class="modal-cancel-btn" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="modal-publish-btn" id="postInteractionSubmit">Comentar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function fillInteractionAvatar() {
    const avatar = document.getElementById('postInteractionAvatar');
    if (!avatar) return;
    const currentUser = window.ConectaPosts.currentUser || (typeof getLoggedUserFromStorage === 'function' ? getLoggedUserFromStorage() : null) || {};
    avatar.classList.remove('has-image');
    if (userPhoto(currentUser)) {
      avatar.innerHTML = `<img src="${escapeHTML(toApiUrl(userPhoto(currentUser)))}" alt="Sua foto">`;
      avatar.classList.add('has-image');
      return;
    }
    avatar.textContent = getInitials(currentUser.nickname || currentUser.first_name || 'U');
  }

  async function refreshAfterInteraction() {
    if (typeof window.loadSinglePost === 'function') return window.loadSinglePost(true);
    if (typeof window.loadCommunityDetailsFromButton === 'function') return window.loadCommunityDetailsFromButton();
    if (typeof window.loadPosts === 'function') return window.loadPosts(true);
    return null;
  }

  function openInteractionModal({ title, placeholder, submitText, endpoint }) {
    const modalEl = ensureInteractionModal();
    const titleEl = document.getElementById('postInteractionTitle');
    const textarea = document.getElementById('postInteractionContent');
    const submitBtn = document.getElementById('postInteractionSubmit');
    const errorEl = document.getElementById('postInteractionError');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    titleEl.textContent = title;
    textarea.value = '';
    textarea.placeholder = placeholder;
    submitBtn.textContent = submitText;
    submitBtn.disabled = true;
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    fillInteractionAvatar();

    const updateSubmitState = () => {
      submitBtn.disabled = textarea.value.trim().length === 0;
    };

    const submit = async () => {
      const content = textarea.value.trim();
      if (!content) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
      errorEl.style.display = 'none';

      try {
        const response = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({ content }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(getApiError(data, 'Erro ao enviar.'));

        textarea.value = '';
        modal.hide();
        await refreshAfterInteraction();
      } catch (error) {
        errorEl.textContent = error.message || 'Erro de conexão com o servidor.';
        errorEl.style.display = 'block';
      } finally {
        submitBtn.textContent = submitText;
        updateSubmitState();
      }
    };

    textarea.oninput = updateSubmitState;
    textarea.onkeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    };
    submitBtn.onclick = submit;

    modal.show();
    setTimeout(() => textarea.focus(), 180);
  }

  window.openPostCommentBox = function(event, postId) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    openInteractionModal({
      title: 'Comentar',
      placeholder: 'Comente este post.',
      submitText: 'Comentar',
      endpoint: `/api/posts/post/${postId}/comment/`,
    });
  };

  window.openCommentReplyBox = function(event, commentId) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    openInteractionModal({
      title: 'Responder',
      placeholder: 'Escreva sua resposta.',
      submitText: 'Responder',
      endpoint: `/api/posts/comment/${commentId}/reply/`,
    });
  };

  window.toggleReplyInput = function(commentId) {
    window.openCommentReplyBox(null, commentId);
  };

  window.loadMoreReplies = function(commentId) {
    const current = window.replyPagination.get(commentId) || 1;
    window.replyPagination.set(commentId, current + 3);
    if (typeof window.loadSinglePost === 'function') window.loadSinglePost(true);
  };

  window.hideReplies = function(commentId, defaultLimit = 1) {
    window.replyPagination.set(commentId, defaultLimit);
    if (typeof window.loadSinglePost === 'function') window.loadSinglePost(true);
  };

  window.ConectaPosts.openPostComments = function(postId) {
    const postEl = document.getElementById(`post-${postId}`);
    if (!postEl) return;
    window.ConectaPosts.handlePostCardClick(null, postId);
    postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.ConectaPosts.renderPostCard = renderPostCard;
  window.ConectaPosts.buildCommentsTree = buildCommentsTree;
  window.ConectaPosts.renderCommunityChip = renderCommunityChip;
  window.ConectaPosts.renderComment = renderComment;
})();
