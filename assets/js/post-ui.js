/* =========================================================
   ConectaPosts: renderização compartilhada de posts/comentários
   - Evita duplicação entre Feed e Comunidade.
   - Mantém comentários fechados até o usuário solicitar.
   - Exibe respostas em formato compacto, uma por vez.
========================================================= */
(function () {
  const openComments = new Set();
  const activeReplyIndex = new Map();

  function getCommentReplies(comment = {}) {
    const replies = comment.replies || comment.children || comment.answers || [];
    return Array.isArray(replies) ? replies : normalizeArray(replies, 'results', 'items');
  }

  function buildCommentsTree(post = {}) {
    const topLevel = normalizeArray(post.top_level_comments, 'results');
    const comments = normalizeArray(post.comments, 'results');
    const source = topLevel.length ? topLevel : comments;

    if (!source.length) return [];

    // Se o backend já enviou comentários aninhados, mantemos os principais.
    if (!source.some((comment) => comment.parent || comment.parent_id)) return source;

    const byId = new Map();
    source.forEach((comment) => {
      byId.set(comment.id, { ...comment, replies: getCommentReplies(comment).slice() });
    });

    const roots = [];
    byId.forEach((comment) => {
      const parentId = typeof comment.parent === 'object' ? comment.parent?.id : (comment.parent || comment.parent_id);
      if (parentId && byId.has(parentId)) byId.get(parentId).replies.push(comment);
      else roots.push(comment);
    });

    return roots;
  }

  function flattenReplies(comment = {}) {
    const result = [];
    const walk = (items) => {
      items.forEach((item) => {
        result.push(item);
        const replies = getCommentReplies(item);
        if (replies.length) walk(replies);
      });
    };
    walk(getCommentReplies(comment));
    return result;
  }

  function commentAuthorHTML(author = {}, item = {}) {
    const when = relativeTime(item.created_at || item.updated_at, 'feito');

    return `
      <div class="comment-header">
        <div class="comment-title">
          ${userLinkHTML(author, userDisplayName(author), 'comment-author')}
          <span class="comment-username">@${escapeHTML(author.nickname || 'usuario')}</span>
          ${when ? `<span class="comment-date"> · ${escapeHTML(when)}</span>` : ''}
          ${item.edited ? '<small class="comment-date"> · (editado)</small>' : ''}
        </div>
      </div>
    `;
  }

  function renderCommentLikeButton(comment = {}, disabled = false) {
    return `
      <button type="button" class="comment-action ${comment.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleCommentLike(${comment.id}, this)" aria-label="Curtir comentário" ${disabled ? 'disabled title="Entre para interagir"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${comment.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="comment-like-count">${comment.total_likes ?? comment.likes_count ?? 0}</span>
      </button>
    `;
  }

  function renderReplyItem(reply = {}, index = 0, parentId = '') {
    const author = reply.author || {};

    return `
      <div class="comment-reply-inline ${index === 0 ? 'active' : 'd-none'}" data-reply-item-for="${parentId}">
        <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author, 'comment-avatar comment-avatar-small')}</a>

        <div class="comment-body">
          ${commentAuthorHTML(author, reply)}

          <p id="comment-text-content-${reply.id}" class="comment-text-line comment-content" data-raw="${escapeHTML(reply.content)}">
            ${escapeHTML(reply.content)}
          </p>

          <div class="comment-actions">
            ${renderCommentLikeButton(reply, false)}

            ${reply.author?.nickname === window.ConectaPosts.currentUserNickname ? `
              <button class="comment-action" onclick="enableCommentEdit(${reply.id})" type="button">Editar</button>
              <button class="comment-action text-danger" onclick="deleteComment(${reply.id})" type="button">Excluir</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderComment(comment = {}, options = {}) {
    const author = comment.author || {};
    const isOwner = author.nickname === options.currentUser?.nickname;
    const replies = flattenReplies(comment);
    const replyCount = replies.length || comment.replies_count || 0;
    const canReply = options.allowCommentInput !== false;

    return `
      <div class="post-comment comment-flat">
        <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author, 'comment-avatar')}</a>

        <div class="comment-body">
          ${commentAuthorHTML(author, comment)}

          <p id="comment-text-content-${comment.id}" class="comment-text-line comment-content" data-raw="${escapeHTML(comment.content)}">
            ${escapeHTML(comment.content)}
          </p>

          <div class="comment-actions">
            ${renderCommentLikeButton(comment, options.canInteract === false)}

            ${canReply ? `<button class="comment-action" onclick="toggleReplyInput(${comment.id})" type="button">Responder${replyCount ? ` (${replyCount})` : ''}</button>` : ''}

            ${isOwner ? `
              <button class="comment-action" onclick="enableCommentEdit(${comment.id})" type="button">Editar</button>
              <button class="comment-action text-danger" onclick="deleteComment(${comment.id})" type="button">Excluir</button>
            ` : ''}
          </div>

          ${canReply ? `
            <div id="reply-box-${comment.id}" class="reply-box d-none">
              <input type="text" id="reply-input-${comment.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Responda a ${escapeHTML(userDisplayName(author))}...">
              <button class="btn login-btn py-1 px-2" type="button" onclick="addReply(${comment.id})">Enviar</button>
            </div>
          ` : ''}

          ${replies.length ? `
            <div class="comment-replies-one" data-reply-group="${comment.id}">
              ${replies.map((reply, index) => renderReplyItem(reply, index, comment.id)).join('')}
              ${replies.length > 1 ? `<button class="comment-action reply-next-btn" type="button" onclick="ConectaPosts.showNextReply(${comment.id})">Ver próxima resposta <span data-reply-counter="${comment.id}">1/${replies.length}</span></button>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderComments(comments = [], options = {}) {
    if (!comments.length) return '<div class="api-empty-state comment-empty-state">Nenhum comentário ainda. Seja o primeiro a comentar.</div>';
    return comments.map((comment) => renderComment(comment, options)).join('');
  }

  function renderCommunityChip(post = {}) {
    const community = post.community || post.community_data || null;
    const slug = community?.slug || post.community_slug;
    const name = community?.name || post.community_name;
    if (!name) return '<span class="post-community-chip">Feito no feed</span>';
    if (!slug) return `<span class="post-community-chip">Feito em ${escapeHTML(name)}</span>`;
    return `<a href="community.html?slug=${encodeURIComponent(slug)}" class="post-community-chip">Feito em ${escapeHTML(name)}</a>`;
  }

  function renderPostActions(post = {}, isOwner = false, options = {}) {
    const disabled = options.canInteract === false;
    return `
      <button class="post-action-btn ${post.liked_by_me ? 'text-primary-custom' : ''}" onclick="toggleLike(${post.id}, this)" type="button" aria-label="Curtir publicação" ${disabled ? 'disabled title="Entre para interagir"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true" style="fill:${post.liked_by_me ? 'currentColor' : 'none'};">
          <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
        </svg>
        <span class="like-count">${postLikesCount(post)}</span>
      </button>
      <button class="post-action-btn" onclick="ConectaPosts.toggleComments(${post.id}, ${options.allowCommentInput === false ? 'false' : 'true'})" type="button" aria-label="Ver comentários">
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

  function renderPostCard(post = {}, options = {}) {
    const author = options.author || post.author || {};
    const currentUser = options.currentUser || null;
    const isOwner = author.nickname && author.nickname === currentUser?.nickname;
    const when = relativeTime(post.created_at || post.updated_at, 'feito');
    const comments = buildCommentsTree(post);
    const isOpen = openComments.has(String(post.id));
    const commentsId = `comments-section-${post.id}`;
    const commentInput = options.allowCommentInput === false ? '' : `
      <div class="comment-input-row mt-3">
        <input type="text" id="comment-input-${post.id}" class="form-control custom-input form-control-sm" maxlength="200" placeholder="Escreva um comentário...">
        <button class="btn login-btn py-1 px-3" type="button" onclick="addComment(${post.id})" ${options.canInteract === false ? 'disabled' : ''}>Enviar</button>
      </div>
    `;

    return `
      <article class="post-card" id="post-${post.id}">
        <a href="${profileUrlFor(author)}" class="avatar-link">${avatarHTML(author)}</a>
        <div class="post-body" style="min-width:0;">
          <div class="post-header">
            <div class="text-truncate">
              ${userLinkHTML(author, userDisplayName(author), 'post-author')}
              <span class="post-username">@${escapeHTML(author.nickname || 'usuario')}</span>
              ${when ? `<span> · ${escapeHTML(when)}</span>` : ''}
              ${post.edited ? ' · <small>(editado)</small>' : ''}
            </div>
          </div>
          ${options.showCommunityLabel ? renderCommunityChip(post) : ''}
          <div id="post-text-content-${post.id}" data-raw="${escapeHTML(post.content)}"><p class="post-text">${escapeHTML(post.content)}</p></div>
          <div class="post-actions">${renderPostActions(post, isOwner, options)}</div>
          <div class="comments-section mt-2 ${isOpen ? '' : 'd-none'}" id="${commentsId}" data-comments-for="${post.id}">
            <div class="comments-list">${renderComments(comments, { ...options, currentUser })}</div>
            ${commentInput}
          </div>
        </div>
      </article>
    `;
  }

  function toggleComments(postId, focusInput = true) {
    const key = String(postId);
    const section = document.getElementById(`comments-section-${postId}`);
    if (!section) return;
    const willOpen = section.classList.contains('d-none');
    section.classList.toggle('d-none', !willOpen);
    if (willOpen) {
      openComments.add(key);
      if (focusInput) setTimeout(() => document.getElementById(`comment-input-${postId}`)?.focus(), 50);
    } else {
      openComments.delete(key);
    }
  }

  function showNextReply(commentId) {
    const items = [...document.querySelectorAll(`[data-reply-item-for="${commentId}"]`)];
    if (!items.length) return;
    const nextIndex = ((activeReplyIndex.get(commentId) || 0) + 1) % items.length;
    activeReplyIndex.set(commentId, nextIndex);
    items.forEach((item, index) => item.classList.toggle('d-none', index !== nextIndex));
    const counter = document.querySelector(`[data-reply-counter="${commentId}"]`);
    if (counter) counter.textContent = `${nextIndex + 1}/${items.length}`;
  }

  function openPostComments(postId) {
    openComments.add(String(postId));
  }

  window.ConectaPosts = {
    currentUserNickname: '',
    renderPostCard,
    buildCommentsTree,
    toggleComments,
    showNextReply,
    openPostComments,
    renderCommunityChip,
  };
}());
