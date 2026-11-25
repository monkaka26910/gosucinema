/**
 * GOSU Credit Manager — Minimalist Realtime Frontend
 * Zero dependencies · Pure Vanilla JS · SSE Realtime + Exponential Backoff
 */
(function () {
  'use strict';

  var CFG = window.GOSU_CONFIG;
  var NEW_PROJECT_SENTINEL = '__NEW__';
  var DEFAULT_LOG_LIMIT = 8;

  var state = {
    snapshot: null,
    editPin: '',
    pinVerified: false,
    modalOpen: false,
    activeTab: 'balance',
    balanceSubmode: 'balance',
    selectedProjectId: '',
    logsExpanded: false,
    sse: null,
    sseRetryDelay: 1200,
    sseRetryTimer: null,
    pollFallbackTimer: null,
    pendingProjectIdForUsage: null,
    confirmTimers: {},
    toastTimer: null
  };

  // DOM Cache
  var el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    el = {
      metaThemeColor: $('meta-theme-color'),
      brandPlatform: $('brand-platform'),
      livePill: $('live-pill'),
      livePillText: $('live-pill-text'),
      themeToggle: $('theme-toggle'),
      iconSun: $('icon-sun'),
      iconMoon: $('icon-moon'),
      openUpdateBtn: $('open-update-btn'),
      unlockIndicator: $('unlock-indicator'),
      offlineBanner: $('offline-banner'),
      offlineBannerMsg: $('offline-banner-msg'),
      retryConnectBtn: $('retry-connect-btn'),

      accountName: $('account-name'),
      planName: $('plan-name'),
      lastUpdated: $('last-updated'),
      remainingCredits: $('remaining-credits'),
      totalCredits: $('total-credits'),
      topupBadge: $('topup-badge'),
      remainingPctBadge: $('remaining-pct-badge'),
      progressTrack: $('progress-track'),
      progressFill: $('progress-fill'),
      progressTopupMarker: $('progress-topup-marker'),
      kpiUsed: $('kpi-used'),
      kpiUsedPct: $('kpi-used-pct'),
      kpiResetDate: $('kpi-reset-date'),
      kpiDaysLeft: $('kpi-days-left'),
      kpiBurnRate: $('kpi-burn-rate'),
      kpiForecast: $('kpi-forecast'),
      priorityNoteWrap: $('priority-note-wrap'),
      priorityNote: $('priority-note'),

      projectsCount: $('projects-count'),
      projectsTotalMeta: $('projects-total-meta'),
      projectsList: $('projects-list'),

      logsCount: $('logs-count'),
      toggleLogsBtn: $('toggle-logs-btn'),
      logsList: $('logs-list'),
      footerApiMode: $('footer-api-mode'),

      modal: $('update-modal'),
      closeModalBtn: $('close-modal-btn'),
      lockPinBtn: $('lock-pin-btn'),
      pinGateForm: $('pin-gate-form'),
      pinInput: $('pin-input'),
      pinSubmitBtn: $('pin-submit-btn'),
      pinError: $('pin-error'),
      editorWorkspace: $('editor-workspace'),
      editorError: $('editor-error'),

      tabBalance: $('tab-balance'),
      tabProjects: $('tab-projects'),
      tabCycle: $('tab-cycle'),

      formBalance: $('form-balance'),
      balRemaining: $('bal-remaining'),
      balDiffPreview: $('bal-diff-preview'),
      balProject: $('bal-project'),
      balActor: $('bal-actor'),
      balNote: $('bal-note'),
      btnSubmitBalance: $('btn-submit-balance'),

      formUsage: $('form-usage'),
      usageProject: $('usage-project'),
      usageNewProjectWrap: $('usage-new-project-wrap'),
      usageNewProjectName: $('usage-new-project-name'),
      usageAmount: $('usage-amount'),
      usageAutoDeduct: $('usage-auto-deduct'),
      usageActor: $('usage-actor'),
      usageNote: $('usage-note'),
      btnSubmitUsage: $('btn-submit-usage'),

      projectPicker: $('project-picker'),
      formProject: $('form-project'),
      projId: $('proj-id'),
      projName: $('proj-name'),
      projCredits: $('proj-credits'),
      projStatus: $('proj-status'),
      projOwner: $('proj-owner'),
      projNote: $('proj-note'),
      projPriority: $('proj-priority'),
      btnDeleteProject: $('btn-delete-project'),
      btnSubmitProject: $('btn-submit-project'),

      formTopup: $('form-topup'),
      topupAmount: $('topup-amount'),
      topupActor: $('topup-actor'),
      topupNote: $('topup-note'),
      btnSubmitTopup: $('btn-submit-topup'),

      formConfig: $('form-config'),
      cfgQuota: $('cfg-quota'),
      cfgResetDay: $('cfg-reset-day'),
      cfgAccount: $('cfg-account'),
      cfgPlan: $('cfg-plan'),
      cfgNote: $('cfg-note'),
      btnResetCycle: $('btn-reset-cycle'),
      btnSubmitConfig: $('btn-submit-config'),

      syncApiModeLabel: $('sync-api-mode-label'),
      syncApiUrlDisplay: $('sync-api-url-display'),
      customApiInput: $('custom-api-input'),
      btnSaveApi: $('btn-save-api'),
      syncEndpointDisplay: $('sync-endpoint-display'),

      toast: $('toast')
    };
  }

  /* ========================================================================
     Formatting & Helpers
     ======================================================================== */
  var numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var pctFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function fmtNum(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '0';
    return numFmt.format(Math.round(v));
  }

  function fmtPct(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '0.0%';
    return pctFmt.format(Math.max(0, Math.min(100, v))) + '%';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseDateSafe(iso) {
    if (!iso) return null;
    var s = String(iso).trim();
    if (!s) return null;
    // Handle YYYY-MM-DD cleanly
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var parts = s.split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function formatDayMonth(dateStr) {
    if (!dateStr) return '—';
    var m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2];
    var d = parseDateSafe(dateStr);
    if (!d) return String(dateStr);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm;
  }

  function formatRelativeTime(iso) {
    var d = parseDateSafe(iso);
    if (!d) return 'Chưa rõ';
    var diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 0) diffSec = 0;
    if (diffSec < 45) return 'vừa xong';
    var mins = Math.floor(diffSec / 60);
    if (mins < 60) return mins + ' phút trước';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' giờ trước';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + ' ngày trước';
    return formatDayMonth(iso);
  }

  function formatFullTime(iso) {
    var d = parseDateSafe(iso);
    if (!d) return '';
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(d);
    } catch (_) {
      return d.toLocaleString();
    }
  }

  function formatCompactLogTime(iso) {
    var d = parseDateSafe(iso);
    if (!d) return '—';
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function getHealthLevel(remainingPct, forecastStatus) {
    var p = Number(remainingPct);
    if (Number.isFinite(p)) {
      if (p < 15) return 'critical';
      if (p <= 35) return 'watch';
      return 'safe';
    }
    if (forecastStatus === 'critical' || forecastStatus === 'watch' || forecastStatus === 'safe') {
      return forecastStatus;
    }
    return 'safe';
  }

  function syncSourceLabel(source) {
    var s = String(source || '').toLowerCase();
    if (s.indexOf('dreamina') !== -1 || s.indexOf('ext') !== -1 || s.indexOf('auto') !== -1) {
      return 'Auto Sync';
    }
    if (s.indexOf('seed') !== -1 || s.indexOf('init') !== -1) {
      return 'Khởi tạo';
    }
    return 'Cập nhật tay';
  }

  function statusLabel(status) {
    if (status === 'done') return 'Hoàn thành';
    if (status === 'paused') return 'Tạm dừng';
    return 'Đang chạy';
  }

  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.setAttribute('data-visible', 'true');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      el.toast.setAttribute('data-visible', 'false');
    }, 2800);
  }

  function flashElement(node) {
    if (!node) return;
    node.classList.remove('value-flash');
    void node.offsetWidth;
    node.classList.add('value-flash');
  }

  function getSavedActor() {
    try {
      return localStorage.getItem(CFG.STORAGE_ACTOR_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function saveActor(name) {
    var clean = String(name || '').trim();
    if (!clean) return;
    try {
      localStorage.setItem(CFG.STORAGE_ACTOR_KEY, clean);
    } catch (_) {}
  }

  /* ========================================================================
     Theme Toggle
     ======================================================================== */
  function applyTheme(theme, persist) {
    var t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    if (el.metaThemeColor) {
      el.metaThemeColor.setAttribute('content', t === 'light' ? '#f5f5f7' : '#09090b');
    }
    if (el.iconSun && el.iconMoon) {
      el.iconSun.toggleAttribute('hidden', t === 'light');
      el.iconMoon.toggleAttribute('hidden', t === 'dark');
    }
    if (persist) {
      try {
        localStorage.setItem(CFG.STORAGE_THEME_KEY, t);
      } catch (_) {}
    }
  }

  function initTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current, false);
  }

  /* ========================================================================
     Normalize Backend Snapshot (defensive against minor field variations)
     ======================================================================== */
  function normalizeSnapshot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var acc = raw.account || raw.config || {};
    var monthlyQuota = Number(acc.monthly_quota != null ? acc.monthly_quota : 22400);
    var topupCredits = Number(acc.topup_credits != null ? acc.topup_credits : 0);
    var totalAvailable = Number(acc.total_available != null ? acc.total_available : (monthlyQuota + topupCredits));
    var remaining = Number(acc.remaining_credits != null ? acc.remaining_credits : 0);
    var used = Number(acc.used_credits != null ? acc.used_credits : Math.max(0, totalAvailable - remaining));
    var remPct = acc.remaining_pct != null
      ? Number(acc.remaining_pct)
      : (totalAvailable > 0 ? (remaining / totalAvailable) * 100 : 0);
    var usedPct = acc.used_pct != null
      ? Number(acc.used_pct)
      : (totalAvailable > 0 ? (used / totalAvailable) * 100 : 0);

    var account = {
      platform: acc.platform || 'Dreamina AI',
      account_name: acc.account_name || 'DES-MEDIA-GOSUHUI',
      plan_name: acc.plan_name || 'Nâng cao',
      monthly_quota: monthlyQuota,
      topup_credits: topupCredits,
      total_available: totalAvailable,
      remaining_credits: remaining,
      used_credits: used,
      remaining_pct: remPct,
      used_pct: usedPct,
      reset_day: Number(acc.reset_day != null ? acc.reset_day : 4),
      next_reset_date: acc.next_reset_date || '',
      days_until_reset: acc.days_until_reset != null ? Number(acc.days_until_reset) : null,
      cycle_start_date: acc.cycle_start_date || '',
      days_elapsed: acc.days_elapsed != null ? Number(acc.days_elapsed) : null,
      avg_daily_burn: acc.avg_daily_burn != null ? Number(acc.avg_daily_burn) : null,
      projected_days_left: acc.projected_days_left != null ? Number(acc.projected_days_left) : null,
      forecast_status: acc.forecast_status || getHealthLevel(remPct),
      priority_note: acc.priority_note != null ? acc.priority_note : '',
      last_updated_at: acc.last_synced_at || acc.updated_at || raw.sync_meta && raw.sync_meta.last_synced_at || raw.server_time || '',
      last_sync_source: acc.last_sync_source || acc.sync_source || (raw.sync_meta && raw.sync_meta.last_sync_source) || 'manual'
    };

    var projectsRaw = Array.isArray(raw.projects) ? raw.projects : [];
    var projects = projectsRaw.map(function (p) {
      return {
        id: String(p.id != null ? p.id : p.name),
        name: String(p.name || 'Chưa đặt tên'),
        priority: Boolean(p.priority),
        status: p.status === 'done' || p.status === 'paused' ? p.status : 'active',
        credits_used: Number(p.credits_used != null ? p.credits_used : 0),
        owner: p.owner || '',
        note: p.note || ''
      };
    });

    projects.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      var statusWeight = { active: 0, paused: 1, done: 2 };
      var sa = statusWeight[a.status] != null ? statusWeight[a.status] : 0;
      var sb = statusWeight[b.status] != null ? statusWeight[b.status] : 0;
      if (sa !== sb) return sa - sb;
      if (b.credits_used !== a.credits_used) return b.credits_used - a.credits_used;
      return a.name.localeCompare(b.name, 'vi');
    });

    var logsRaw = Array.isArray(raw.logs) ? raw.logs : [];
    var logs = logsRaw.map(function (l) {
      var deltaVal = l.delta != null ? Number(l.delta) : (l.amount != null ? Number(l.amount) : 0);
      var evType = String(l.event_type || l.type || l.action || '').toLowerCase();
      return {
        id: l.id,
        event_type: evType,
        delta: deltaVal,
        project_name: l.project_name || l.project || '',
        actor: l.actor || l.source || '',
        source: l.source || '',
        note: l.note || l.message || '',
        created_at: l.created_at || l.timestamp || l.time || ''
      };
    });

    return {
      account: account,
      projects: projects,
      logs: logs,
      server_time: raw.server_time || ''
    };
  }

  /* ========================================================================
     Render Dashboard
     ======================================================================== */
  function renderSnapshot(nextRaw, isRealtimeUpdate) {
    var next = normalizeSnapshot(nextRaw);
    if (!next) return;

    var prev = state.snapshot;
    state.snapshot = next;

    var acc = next.account;
    var level = getHealthLevel(acc.remaining_pct, acc.forecast_status);

    // Top bar & page title
    if (el.brandPlatform) el.brandPlatform.textContent = acc.platform || 'Dreamina AI';
    document.title = fmtNum(acc.remaining_credits) + ' · GOSU Credit';

    // Hero Identity
    el.accountName.textContent = acc.account_name;
    var planLabel = acc.plan_name.toLowerCase().indexOf('gói') === 0 ? acc.plan_name : ('Gói ' + acc.plan_name);
    el.planName.textContent = planLabel;
    updateRelativeTimestamp();

    // Hero Balance
    var remainingChanged = prev && prev.account.remaining_credits !== acc.remaining_credits;
    el.remainingCredits.textContent = fmtNum(acc.remaining_credits);
    if (remainingChanged && isRealtimeUpdate) {
      flashElement(el.remainingCredits);
    }

    el.totalCredits.textContent = '/ ' + fmtNum(acc.total_available) + ' credit';

    if (acc.topup_credits > 0) {
      el.topupBadge.hidden = false;
      el.topupBadge.textContent = '+' + fmtNum(acc.topup_credits) + ' bổ sung';
    } else {
      el.topupBadge.hidden = true;
    }

    el.remainingPctBadge.setAttribute('data-level', level);
    el.remainingPctBadge.textContent = fmtPct(acc.remaining_pct) + ' còn lại';

    // Progress Bar
    var fillPct = Math.max(0, Math.min(100, acc.remaining_pct));
    el.progressFill.setAttribute('data-level', level);
    el.progressFill.style.width = fillPct.toFixed(2) + '%';
    el.progressTrack.setAttribute('aria-valuenow', String(Math.round(fillPct)));

    if (acc.topup_credits > 0 && acc.total_available > 0) {
      var baseShare = (acc.monthly_quota / acc.total_available) * 100;
      el.progressTopupMarker.hidden = false;
      el.progressTopupMarker.style.left = Math.min(98, Math.max(2, baseShare)).toFixed(2) + '%';
      el.progressTopupMarker.title = 'Mốc gói tháng (' + fmtNum(acc.monthly_quota) + ') + gói bổ sung (' + fmtNum(acc.topup_credits) + ')';
    } else {
      el.progressTopupMarker.hidden = true;
    }

    // 3 Inline KPIs
    el.kpiUsed.textContent = fmtNum(acc.used_credits);
    el.kpiUsedPct.textContent = fmtPct(acc.used_pct) + ' tổng gói';

    el.kpiResetDate.textContent = acc.next_reset_date
      ? formatDayMonth(acc.next_reset_date)
      : ('Ngày ' + acc.reset_day);
    if (acc.days_until_reset != null) {
      el.kpiDaysLeft.textContent = acc.days_until_reset === 0
        ? 'Reset hôm nay'
        : ('còn ' + acc.days_until_reset + ' ngày');
    } else {
      el.kpiDaysLeft.textContent = 'Reset ngày ' + acc.reset_day + ' hàng tháng';
    }

    var burn = acc.avg_daily_burn;
    if (burn != null && burn > 0) {
      el.kpiBurnRate.textContent = '~' + fmtNum(burn) + ' / ngày';
    } else {
      el.kpiBurnRate.textContent = '0 / ngày';
    }

    var forecastTone = acc.forecast_status || level;
    var forecastText = 'Đủ tới ngày reset';
    if (acc.remaining_credits <= 0) {
      forecastTone = 'critical';
      forecastText = 'Đã hết · Cần mua gói bổ sung';
    } else if (forecastTone === 'critical') {
      forecastText = 'Cần mua gói bổ sung';
    } else if (forecastTone === 'watch') {
      if (acc.projected_days_left != null && acc.days_until_reset != null && acc.projected_days_left < acc.days_until_reset) {
        forecastText = 'Dự kiến hết sau ~' + Math.max(1, Math.round(acc.projected_days_left)) + ' ngày';
      } else {
        forecastText = 'Cần tiết kiệm ưu tiên';
      }
    }
    el.kpiForecast.setAttribute('data-tone', forecastTone);
    el.kpiForecast.textContent = forecastText;

    // Priority Note
    if (acc.priority_note && acc.priority_note.trim()) {
      el.priorityNoteWrap.hidden = false;
      el.priorityNote.textContent = acc.priority_note.trim();
    } else {
      el.priorityNoteWrap.hidden = true;
    }

    // Projects List
    renderProjects(next.projects, prev ? prev.projects : null, isRealtimeUpdate, acc.used_credits);

    // Recent Updates Timeline
    renderLogs(next.logs);

    // Keep modal dropdowns / fields fresh if open
    if (state.modalOpen && state.pinVerified) {
      refreshModalSelectorsOnly();
    }
  }

  function updateRelativeTimestamp() {
    if (!state.snapshot || !el.lastUpdated) return;
    var acc = state.snapshot.account;
    var rel = formatRelativeTime(acc.last_updated_at);
    var src = syncSourceLabel(acc.last_sync_source);
    var prefix = rel === 'vừa xong' ? 'Vừa cập nhật' : ('Cập nhật ' + rel);
    el.lastUpdated.textContent = prefix + ' · ' + src;
    el.lastUpdated.title = acc.last_updated_at ? formatFullTime(acc.last_updated_at) : '';
  }

  function renderProjects(projects, prevProjects, isRealtimeUpdate, accountUsed) {
    el.projectsCount.textContent = String(projects.length);

    var totalProjectCredits = projects.reduce(function (sum, p) {
      return sum + Math.max(0, p.credits_used);
    }, 0);

    var denominator = Math.max(totalProjectCredits, accountUsed || 0, 1);
    el.projectsTotalMeta.textContent = totalProjectCredits > 0
      ? ('Tổng phân bổ: ' + fmtNum(totalProjectCredits) + ' credit')
      : '';

    if (!projects.length) {
      el.projectsList.innerHTML = '<div class="empty-state">Chưa có dự án nào. Nhấn “Cập nhật” để thêm dự án đầu tiên.</div>';
      return;
    }

    var prevMap = {};
    if (prevProjects) {
      prevProjects.forEach(function (p) { prevMap[p.id] = p.credits_used; });
    }

    var html = projects.map(function (p) {
      var sharePct = totalProjectCredits > 0 ? (p.credits_used / totalProjectCredits) * 100 : 0;
      var barPct = Math.max(p.credits_used > 0 ? 3 : 0, Math.min(100, (p.credits_used / denominator) * 100));
      var metaParts = [];
      if (p.owner) metaParts.push(p.owner);
      if (p.note) metaParts.push(p.note);
      var metaStr = metaParts.join(' · ') || 'Nhấn để ghi nhận credit';
      var changed = isRealtimeUpdate && prevMap[p.id] != null && prevMap[p.id] !== p.credits_used;

      return (
        '<button type="button" class="project-row" data-project-id="' + escapeHtml(p.id) + '" ' +
        'data-priority="' + (p.priority ? 'true' : 'false') + '" data-status="' + escapeHtml(p.status) + '" ' +
        'title="Nhấn để ghi nhận nhanh credit cho ' + escapeHtml(p.name) + '">' +
          '<div class="project-main">' +
            '<div class="project-title-line">' +
              '<span class="project-name">' + escapeHtml(p.name) + '</span>' +
              (p.priority ? '<span class="priority-pill">Ưu tiên</span>' : '') +
              '<span class="status-chip" data-status="' + escapeHtml(p.status) + '">' +
                '<span class="status-dot" aria-hidden="true"></span>' +
                '<span>' + escapeHtml(statusLabel(p.status)) + '</span>' +
              '</span>' +
            '</div>' +
            '<div class="project-meta">' + escapeHtml(metaStr) + '</div>' +
          '</div>' +
          '<div class="project-metrics">' +
            '<div class="project-numbers tabular">' +
              '<span class="project-credits' + (changed ? ' value-flash' : '') + '">' + fmtNum(p.credits_used) + '</span>' +
              '<span class="project-share">' + fmtPct(sharePct) + '</span>' +
            '</div>' +
            '<div class="project-bar-track" aria-hidden="true">' +
              '<div class="project-bar-fill" style="width:' + barPct.toFixed(1) + '%"></div>' +
            '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('');

    el.projectsList.innerHTML = html;
  }

  function renderLogs(logs) {
    el.logsCount.textContent = String(logs.length);

    if (logs.length > DEFAULT_LOG_LIMIT) {
      el.toggleLogsBtn.hidden = false;
      el.toggleLogsBtn.textContent = state.logsExpanded
        ? 'Thu gọn'
        : ('Xem thêm (' + logs.length + ')');
    } else {
      el.toggleLogsBtn.hidden = true;
    }

    if (!logs.length) {
      el.logsList.innerHTML = '<div class="empty-state">Chưa có lịch sử cập nhật.</div>';
      return;
    }

    var visibleLogs = state.logsExpanded ? logs.slice(0, 30) : logs.slice(0, DEFAULT_LOG_LIMIT);

    el.logsList.innerHTML = visibleLogs.map(function (item) {
      var kind = 'spend';
      var badgeText = '';
      var ev = item.event_type;
      var d = Number(item.delta) || 0;

      if (ev.indexOf('topup') !== -1) {
        kind = 'topup';
        badgeText = '+' + fmtNum(Math.abs(d));
      } else if (ev.indexOf('reset') !== -1) {
        kind = 'reset';
        badgeText = 'Reset';
      } else if (ev.indexOf('sync') !== -1) {
        kind = d < 0 ? 'spend' : 'sync';
        badgeText = d === 0 ? 'Sync' : (d > 0 ? '+' + fmtNum(d) : '-' + fmtNum(Math.abs(d)));
      } else if (d > 0) {
        kind = 'topup';
        badgeText = '+' + fmtNum(d);
      } else if (d < 0) {
        kind = 'spend';
        badgeText = '-' + fmtNum(Math.abs(d));
      } else {
        kind = 'sync';
        badgeText = item.source === 'dreamina_ext' ? 'Sync' : 'Cập nhật';
      }

      var noteText = item.note || (ev.indexOf('sync') !== -1 ? 'Đồng bộ Dreamina' : 'Cập nhật số dư');
      var actorText = item.actor || (ev.indexOf('sync') !== -1 ? 'Auto Sync' : 'Team');
      var fullTitle = (item.project_name ? item.project_name + ' — ' : '') + noteText +
        (item.created_at ? ' (' + formatFullTime(item.created_at) + ')' : '');

      return (
        '<div class="log-row" title="' + escapeHtml(fullTitle) + '">' +
          '<span class="log-time tabular">' + escapeHtml(formatCompactLogTime(item.created_at)) + '</span>' +
          '<span class="log-delta tabular" data-kind="' + kind + '">' + escapeHtml(badgeText) + '</span>' +
          '<div class="log-body">' +
            (item.project_name ? '<span class="log-project">' + escapeHtml(item.project_name) + '</span>' : '') +
            '<span class="log-note">' + escapeHtml(noteText) + '</span>' +
          '</div>' +
          '<span class="log-actor">' + escapeHtml(actorText) + '</span>' +
        '</div>'
      );
    }).join('');
  }

  /* ========================================================================
     Connection Status, Initial Fetch & Realtime SSE
     ======================================================================== */
  function setLiveState(mode, customText) {
    if (!el.livePill) return;
    el.livePill.setAttribute('data-state', mode);
    if (mode === 'live') {
      el.livePillText.textContent = customText || 'Trực tiếp';
      el.offlineBanner.hidden = true;
    } else if (mode === 'connecting') {
      el.livePillText.textContent = customText || 'Đang kết nối lại...';
    } else {
      el.livePillText.textContent = customText || 'Ngoại tuyến';
    }
  }

  function updateApiDisplay() {
    var base = CFG.getApiBase();
    var modeLabel = CFG.getApiModeLabel();
    if (el.footerApiMode) el.footerApiMode.textContent = modeLabel;
    if (el.syncApiModeLabel) el.syncApiModeLabel.textContent = modeLabel;
    if (el.syncApiUrlDisplay) {
      el.syncApiUrlDisplay.textContent = base || (window.location.origin + ' (same-origin)');
    }
    if (el.syncEndpointDisplay) {
      el.syncEndpointDisplay.textContent = (base || window.location.origin) + '/api/sync/dreamina';
    }
    if (el.customApiInput) {
      try {
        el.customApiInput.value = localStorage.getItem(CFG.STORAGE_API_KEY) || '';
      } catch (_) {}
    }
  }

  async function fetchState(showSpinnerText) {
    if (showSpinnerText && !state.snapshot) {
      setLiveState('connecting', 'Đang kết nối...');
    }
    try {
      var res = await fetch(CFG.apiUrl('/api/state'), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      renderSnapshot(data, false);
      el.offlineBanner.hidden = true;
      return true;
    } catch (_) {
      el.offlineBanner.hidden = false;
      el.offlineBannerMsg.textContent = state.snapshot
        ? 'Mất kết nối tạm thời với máy chủ — đang tự động kết nối lại...'
        : 'Đang kết nối máy chủ dữ liệu GOSU Credit...';
      if (!state.snapshot) {
        setLiveState('offline', 'Ngoại tuyến');
      }
      return false;
    }
  }

  function closeSSE() {
    if (state.sseRetryTimer) {
      clearTimeout(state.sseRetryTimer);
      state.sseRetryTimer = null;
    }
    if (state.sse) {
      try { state.sse.close(); } catch (_) {}
      state.sse = null;
    }
  }

  function connectSSE() {
    closeSSE();

    if (typeof window.EventSource !== 'function') {
      // Ultra-rare fallback: polite 10s polling
      setLiveState('live', 'Tự động làm mới');
      if (!state.pollFallbackTimer) {
        state.pollFallbackTimer = setInterval(function () { fetchState(false); }, 10000);
      }
      return;
    }

    var streamUrl = CFG.apiUrl('/api/stream');
    var es;
    try {
      es = new EventSource(streamUrl);
    } catch (_) {
      scheduleSSEReconnect();
      return;
    }

    state.sse = es;

    es.onopen = function () {
      state.sseRetryDelay = 1200;
      setLiveState('live', 'Trực tiếp');
    };

    function handleStateMessage(ev) {
      if (!ev || !ev.data) return;
      try {
        var payload = JSON.parse(ev.data);
        var prevRemaining = state.snapshot ? state.snapshot.account.remaining_credits : null;
        renderSnapshot(payload, true);
        setLiveState('live', 'Trực tiếp');
        if (prevRemaining !== null && state.snapshot && state.snapshot.account.remaining_credits !== prevRemaining && !state.modalOpen) {
          showToast('Cập nhật mới: còn ' + fmtNum(state.snapshot.account.remaining_credits) + ' credit');
        }
      } catch (_) {
        // ignore keepalive or malformed frame
      }
    }

    es.addEventListener('state', handleStateMessage);
    es.onmessage = handleStateMessage;

    es.onerror = function () {
      if (state.sse === es) {
        try { es.close(); } catch (_) {}
        state.sse = null;
      }
      setLiveState('connecting', 'Đang kết nối lại...');
      scheduleSSEReconnect();
    };
  }

  function scheduleSSEReconnect() {
    if (state.sseRetryTimer) return;
    var delay = state.sseRetryDelay;
    state.sseRetryDelay = Math.min(15000, Math.round(state.sseRetryDelay * 1.7));
    state.sseRetryTimer = setTimeout(function () {
      state.sseRetryTimer = null;
      fetchState(false).finally(connectSSE);
    }, delay);
  }

  /* ========================================================================
     API Request Helper (with X-Edit-Pin)
     ======================================================================== */
  async function apiMutate(method, path, body) {
    var headers = {
      'Accept': 'application/json',
      'X-Edit-Pin': state.editPin || ''
    };
    var opts = { method: method, headers: headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(CFG.apiUrl(path), opts);
    var data = null;
    try { data = await res.json(); } catch (_) {}

    if (res.status === 401 || res.status === 403) {
      clearSavedPin();
      showPinGate('Mã nhóm đã hết hiệu lực hoặc không đúng. Vui lòng nhập lại.');
      throw new Error('AUTH_REQUIRED');
    }
    if (!res.ok) {
      var errMsg = (data && (data.error || data.detail || data.message)) || ('Lỗi máy chủ (' + res.status + ')');
      throw new Error(errMsg);
    }
    // If server returns updated snapshot directly, render immediately before SSE even arrives
    if (data && data.account && data.projects) {
      renderSnapshot(data, true);
    } else if (data && data.state && data.state.account) {
      renderSnapshot(data.state, true);
    }
    return data;
  }

  /* ========================================================================
     PIN Verification & Desktop Auto-Unlock
     ======================================================================== */
  function setUnlocked(pin) {
    state.editPin = pin;
    state.pinVerified = true;
    try {
      localStorage.setItem(CFG.STORAGE_PIN_KEY, pin);
    } catch (_) {}
    if (el.unlockIndicator) el.unlockIndicator.hidden = false;
    if (el.lockPinBtn) el.lockPinBtn.hidden = false;
  }

  function clearSavedPin() {
    state.editPin = '';
    state.pinVerified = false;
    try {
      localStorage.removeItem(CFG.STORAGE_PIN_KEY);
    } catch (_) {}
    if (el.unlockIndicator) el.unlockIndicator.hidden = true;
    if (el.lockPinBtn) el.lockPinBtn.hidden = true;
  }

  async function verifyPin(pin) {
    var res = await fetch(CFG.apiUrl('/api/auth/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ pin: pin })
    });
    if (res.ok) {
      var d = null;
      try { d = await res.json(); } catch (_) {}
      return !d || d.ok !== false;
    }
    return false;
  }

  async function tryAutoUnlock() {
    var desktopPin = CFG.consumeInitialPin();
    var candidate = desktopPin;
    if (!candidate) {
      try {
        candidate = localStorage.getItem(CFG.STORAGE_PIN_KEY) || '';
      } catch (_) {}
    }
    if (!candidate) return;

    try {
      var ok = await verifyPin(candidate);
      if (ok) {
        setUnlocked(candidate);
      } else if (!desktopPin) {
        clearSavedPin();
      }
    } catch (_) {
      // Server might be temporarily offline; keep saved PIN for retry when user opens modal
      state.editPin = candidate;
    }
  }

  /* ========================================================================
     Modal & Tabs Management
     ======================================================================== */
  function openModal(options) {
    options = options || {};
    state.modalOpen = true;
    state.pendingProjectIdForUsage = options.projectId || null;

    if (options.tab) {
      state.activeTab = options.tab;
    } else if (options.projectId) {
      state.activeTab = 'balance';
      state.balanceSubmode = 'usage';
    }

    el.modal.hidden = false;
    requestAnimationFrame(function () {
      el.modal.setAttribute('data-open', 'true');
    });

    clearEditorError();
    if (state.pinVerified) {
      showEditorWorkspace();
    } else if (state.editPin) {
      // Verify stored PIN seamlessly
      verifyPin(state.editPin).then(function (ok) {
        if (ok) {
          setUnlocked(state.editPin);
          showEditorWorkspace();
        } else {
          clearSavedPin();
          showPinGate();
        }
      }).catch(function () {
        showPinGate('Không thể xác thực mã lúc này. Kiểm tra kết nối máy chủ.');
      });
    } else {
      showPinGate();
    }
  }

  function closeModal() {
    state.modalOpen = false;
    el.modal.setAttribute('data-open', 'false');
    resetConfirmButtons();
    setTimeout(function () {
      if (!state.modalOpen) el.modal.hidden = true;
    }, 200);
  }

  function showPinGate(errorMessage) {
    el.pinGateForm.hidden = false;
    el.editorWorkspace.hidden = true;
    el.lockPinBtn.hidden = true;
    el.pinInput.value = '';
    if (errorMessage) {
      el.pinError.textContent = errorMessage;
      el.pinError.hidden = false;
    } else {
      el.pinError.hidden = true;
    }
    setTimeout(function () {
      try { el.pinInput.focus(); } catch (_) {}
    }, 60);
  }

  function showEditorWorkspace() {
    el.pinGateForm.hidden = true;
    el.editorWorkspace.hidden = false;
    el.lockPinBtn.hidden = false;
    populateEditorForms();
    switchTab(state.activeTab);
    switchBalanceSubmode(state.balanceSubmode);

    if (state.pendingProjectIdForUsage) {
      el.usageProject.value = state.pendingProjectIdForUsage;
      toggleNewProjectInput();
      state.pendingProjectIdForUsage = null;
      setTimeout(function () {
        try { el.usageAmount.focus(); } catch (_) {}
      }, 60);
    }
  }

  function clearEditorError() {
    el.editorError.hidden = true;
    el.editorError.textContent = '';
  }

  function showEditorError(msg) {
    if (msg === 'AUTH_REQUIRED') return;
    el.editorError.textContent = msg;
    el.editorError.hidden = false;
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    clearEditorError();
    resetConfirmButtons();

    var tabBtns = el.editorWorkspace.querySelectorAll('[data-tab]');
    tabBtns.forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.getAttribute('data-tab') === tabName ? 'true' : 'false');
    });

    el.tabBalance.hidden = tabName !== 'balance';
    el.tabProjects.hidden = tabName !== 'projects';
    el.tabCycle.hidden = tabName !== 'cycle';

    if (tabName === 'projects') {
      renderProjectPicker();
    } else if (tabName === 'cycle') {
      populateConfigForm();
      updateApiDisplay();
    }
  }

  function switchBalanceSubmode(mode) {
    state.balanceSubmode = mode;
    clearEditorError();
    var subBtns = el.tabBalance.querySelectorAll('[data-submode]');
    subBtns.forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.getAttribute('data-submode') === mode ? 'true' : 'false');
    });
    el.formBalance.hidden = mode !== 'balance';
    el.formUsage.hidden = mode !== 'usage';
  }

  function populateEditorForms() {
    var actor = getSavedActor();
    if (actor) {
      if (!el.balActor.value) el.balActor.value = actor;
      if (!el.usageActor.value) el.usageActor.value = actor;
      if (!el.topupActor.value) el.topupActor.value = actor;
    }

    if (state.snapshot) {
      el.balRemaining.placeholder = String(state.snapshot.account.remaining_credits);
    }
    el.balRemaining.value = '';
    el.balNote.value = '';
    updateBalanceDiffPreview();

    el.usageAmount.value = '';
    el.usageNote.value = '';
    el.usageNewProjectName.value = '';

    refreshModalSelectorsOnly();
    populateConfigForm();
    updateApiDisplay();
  }

  function refreshModalSelectorsOnly() {
    var projects = state.snapshot ? state.snapshot.projects : [];

    var prevBalProj = el.balProject.value;
    el.balProject.innerHTML = '<option value="">Không gán dự án cụ thể</option>' +
      projects.map(function (p) {
        return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + (p.priority ? ' ★' : '') + '</option>';
      }).join('');
    if (prevBalProj) el.balProject.value = prevBalProj;

    var prevUsageProj = el.usageProject.value;
    var usageOpts = projects.map(function (p) {
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + (p.priority ? ' ★' : '') + '</option>';
    }).join('') + '<option value="' + NEW_PROJECT_SENTINEL + '">+ Tạo dự án mới...</option>';
    el.usageProject.innerHTML = usageOpts;
    if (prevUsageProj && Array.prototype.some.call(el.usageProject.options, function (o) { return o.value === prevUsageProj; })) {
      el.usageProject.value = prevUsageProj;
    }
    toggleNewProjectInput();

    if (state.activeTab === 'projects') {
      renderProjectPicker();
    }
  }

  function toggleNewProjectInput() {
    var isNew = el.usageProject.value === NEW_PROJECT_SENTINEL;
    el.usageNewProjectWrap.hidden = !isNew;
    el.usageNewProjectName.required = isNew;
  }

  function updateBalanceDiffPreview() {
    if (!state.snapshot) {
      el.balDiffPreview.textContent = 'Nhập số credit đang hiển thị trên Dreamina.';
      el.balDiffPreview.removeAttribute('data-tone');
      return;
    }
    var current = state.snapshot.account.remaining_credits;
    var raw = el.balRemaining.value.trim();
    if (raw === '') {
      el.balDiffPreview.textContent = 'Số dư hiện tại trong hệ thống: ' + fmtNum(current) + ' credit.';
      el.balDiffPreview.removeAttribute('data-tone');
      return;
    }
    var val = Number(raw);
    if (!Number.isFinite(val) || val < 0) {
      el.balDiffPreview.textContent = 'Vui lòng nhập số không âm.';
      el.balDiffPreview.setAttribute('data-tone', 'spend');
      return;
    }
    var diff = val - current;
    if (diff === 0) {
      el.balDiffPreview.textContent = 'Không đổi so với hiện tại (' + fmtNum(current) + ').';
      el.balDiffPreview.removeAttribute('data-tone');
    } else if (diff < 0) {
      el.balDiffPreview.textContent = 'Chênh lệch: ' + fmtNum(diff) + ' credit (đã dùng thêm ' + fmtNum(Math.abs(diff)) + ').';
      el.balDiffPreview.setAttribute('data-tone', 'spend');
    } else {
      el.balDiffPreview.textContent = 'Chênh lệch: +' + fmtNum(diff) + ' credit so với hiện tại.';
      el.balDiffPreview.setAttribute('data-tone', 'gain');
    }
  }

  /* ========================================================================
     Tab 2: Project Picker & Edit Form
     ======================================================================== */
  function renderProjectPicker() {
    var projects = state.snapshot ? state.snapshot.projects : [];
    var chips = [
      '<button type="button" class="chip-btn" data-pick-project="" data-active="' + (state.selectedProjectId === '' ? 'true' : 'false') + '">+ Dự án mới</button>'
    ];
    projects.forEach(function (p) {
      var active = state.selectedProjectId === p.id;
      chips.push(
        '<button type="button" class="chip-btn" data-pick-project="' + escapeHtml(p.id) + '" data-active="' + (active ? 'true' : 'false') + '">' +
        escapeHtml(p.name) +
        '</button>'
      );
    });
    el.projectPicker.innerHTML = chips.join('');
    loadProjectIntoForm(state.selectedProjectId);
  }

  function loadProjectIntoForm(projectId) {
    state.selectedProjectId = projectId || '';
    resetConfirmButtons();
    var projects = state.snapshot ? state.snapshot.projects : [];
    var found = projects.find(function (p) { return p.id === state.selectedProjectId; });

    if (found) {
      el.projId.value = found.id;
      el.projName.value = found.name;
      el.projCredits.value = String(found.credits_used);
      el.projStatus.value = found.status;
      el.projOwner.value = found.owner || '';
      el.projNote.value = found.note || '';
      el.projPriority.checked = Boolean(found.priority);
      el.btnDeleteProject.hidden = false;
      el.btnSubmitProject.textContent = 'Lưu thay đổi';
    } else {
      el.projId.value = '';
      el.projName.value = '';
      el.projCredits.value = '0';
      el.projStatus.value = 'active';
      el.projOwner.value = 'Team Media';
      el.projNote.value = '';
      el.projPriority.checked = false;
      el.btnDeleteProject.hidden = true;
      el.btnSubmitProject.textContent = 'Thêm dự án';
    }
  }

  function populateConfigForm() {
    if (!state.snapshot) return;
    var acc = state.snapshot.account;
    el.cfgQuota.value = String(acc.monthly_quota);
    el.cfgResetDay.value = String(acc.reset_day);
    el.cfgAccount.value = acc.account_name;
    el.cfgPlan.value = acc.plan_name;
    el.cfgNote.value = acc.priority_note || '';
  }

  /* ========================================================================
     Inline 2-Step Confirmation Helper (Zero ugly window.confirm dialogs)
     ======================================================================== */
  function resetConfirmButtons() {
    [el.btnDeleteProject, el.btnResetCycle].forEach(function (btn) {
      if (!btn) return;
      btn.removeAttribute('data-confirming');
      if (btn === el.btnDeleteProject) btn.textContent = 'Xóa dự án';
      if (btn === el.btnResetCycle) btn.textContent = 'Reset chu kỳ mới';
    });
    Object.keys(state.confirmTimers).forEach(function (k) {
      clearTimeout(state.confirmTimers[k]);
      delete state.confirmTimers[k];
    });
  }

  function requireSecondTap(btn, key, confirmLabel, defaultLabel) {
    if (btn.getAttribute('data-confirming') === 'true') {
      resetConfirmButtons();
      return true;
    }
    btn.setAttribute('data-confirming', 'true');
    btn.textContent = confirmLabel;
    if (state.confirmTimers[key]) clearTimeout(state.confirmTimers[key]);
    state.confirmTimers[key] = setTimeout(function () {
      btn.removeAttribute('data-confirming');
      btn.textContent = defaultLabel;
    }, 4000);
    return false;
  }

  /* ========================================================================
     Event Bindings
     ======================================================================== */
  function bindEvents() {
    // Theme toggle
    el.themeToggle.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark', true);
    });

    // Live pill manual refresh/reconnect
    el.livePill.addEventListener('click', function () {
      setLiveState('connecting', 'Đang làm mới...');
      fetchState(false).then(function (ok) {
        if (ok) {
          connectSSE();
          showToast('Đã đồng bộ dữ liệu mới nhất');
        }
      });
    });

    el.retryConnectBtn.addEventListener('click', function () {
      fetchState(true).then(function (ok) {
        if (ok) connectSSE();
      });
    });

    // Open & close modal
    el.openUpdateBtn.addEventListener('click', function () {
      openModal({ tab: 'balance' });
    });

    el.closeModalBtn.addEventListener('click', closeModal);

    el.modal.addEventListener('click', function (ev) {
      if (ev.target === el.modal) closeModal();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && state.modalOpen) {
        closeModal();
      }
    });

    // Lock PIN button
    el.lockPinBtn.addEventListener('click', function () {
      clearSavedPin();
      showPinGate();
      showToast('Đã khóa chỉnh sửa trên thiết bị này');
    });

    // Click project row -> 1-tap quick usage log
    el.projectsList.addEventListener('click', function (ev) {
      var row = ev.target.closest('.project-row');
      if (!row) return;
      var pid = row.getAttribute('data-project-id');
      if (pid) {
        openModal({ tab: 'balance', projectId: pid });
      }
    });

    // Toggle logs expansion
    el.toggleLogsBtn.addEventListener('click', function () {
      state.logsExpanded = !state.logsExpanded;
      if (state.snapshot) renderLogs(state.snapshot.logs);
    });

    // PIN Gate Submit
    el.pinGateForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var pin = el.pinInput.value.trim();
      if (!pin) return;
      el.pinSubmitBtn.disabled = true;
      el.pinError.hidden = true;
      try {
        var ok = await verifyPin(pin);
        if (ok) {
          setUnlocked(pin);
          showEditorWorkspace();
          showToast('Đã mở khóa chỉnh sửa');
        } else {
          el.pinError.textContent = 'Mã nhóm không đúng, vui lòng thử lại.';
          el.pinError.hidden = false;
          el.pinInput.select();
        }
      } catch (_) {
        el.pinError.textContent = 'Không thể kết nối máy chủ để kiểm tra mã.';
        el.pinError.hidden = false;
      } finally {
        el.pinSubmitBtn.disabled = false;
      }
    });

    // Tab switching
    el.editorWorkspace.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    el.tabBalance.querySelectorAll('[data-submode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchBalanceSubmode(btn.getAttribute('data-submode'));
      });
    });

    // Balance live diff preview
    el.balRemaining.addEventListener('input', updateBalanceDiffPreview);

    // Usage new-project toggle
    el.usageProject.addEventListener('change', toggleNewProjectInput);

    // Submit: Set Remaining Balance
    el.formBalance.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      clearEditorError();
      var val = Number(el.balRemaining.value);
      if (!Number.isFinite(val) || val < 0) {
        showEditorError('Vui lòng nhập số dư hợp lệ.');
        return;
      }
      var actor = el.balActor.value.trim();
      saveActor(actor);

      el.btnSubmitBalance.disabled = true;
      try {
        var payload = {
          remaining_credits: Math.round(val),
          actor: actor || 'Team Media',
          note: el.balNote.value.trim()
        };
        if (el.balProject.value) {
          payload.project_id = String(el.balProject.value);
        }
        await apiMutate('POST', '/api/balance', payload);
        showToast('Đã cập nhật số dư: ' + fmtNum(val) + ' credit');
        closeModal();
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.btnSubmitBalance.disabled = false;
      }
    });

    // Submit: Log Project Usage
    el.formUsage.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      clearEditorError();
      var amount = Number(el.usageAmount.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        showEditorError('Vui lòng nhập số credit lớn hơn 0.');
        return;
      }
      var isNew = el.usageProject.value === NEW_PROJECT_SENTINEL;
      var newName = el.usageNewProjectName.value.trim();
      if (isNew && !newName) {
        showEditorError('Vui lòng nhập tên dự án mới.');
        return;
      }

      var actor = el.usageActor.value.trim();
      saveActor(actor);

      el.btnSubmitUsage.disabled = true;
      try {
        var payload = {
          amount: Math.round(amount),
          auto_deduct: Boolean(el.usageAutoDeduct.checked),
          actor: actor || 'Team Media',
          note: el.usageNote.value.trim()
        };
        if (isNew) {
          payload.project_name = newName;
        } else {
          payload.project_id = String(el.usageProject.value);
        }
        await apiMutate('POST', '/api/usage', payload);
        showToast('Đã ghi nhận -' + fmtNum(amount) + ' credit');
        closeModal();
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.btnSubmitUsage.disabled = false;
      }
    });

    // Tab 2: Project Picker click
    el.projectPicker.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-pick-project]');
      if (!btn) return;
      state.selectedProjectId = btn.getAttribute('data-pick-project') || '';
      renderProjectPicker();
    });

    // Tab 2: Save Project
    el.formProject.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      clearEditorError();
      var name = el.projName.value.trim();
      if (!name) {
        showEditorError('Vui lòng nhập tên dự án.');
        return;
      }
      var creditsUsed = Math.max(0, Math.round(Number(el.projCredits.value) || 0));

      el.btnSubmitProject.disabled = true;
      try {
        var payload = {
          name: name,
          credits_used: creditsUsed,
          status: el.projStatus.value,
          owner: el.projOwner.value.trim() || 'Team Media',
          note: el.projNote.value.trim(),
          priority: Boolean(el.projPriority.checked)
        };
        if (el.projId.value) {
          payload.id = String(el.projId.value);
        }
        await apiMutate('POST', '/api/projects', payload);
        showToast(el.projId.value ? ('Đã cập nhật dự án ' + name) : ('Đã thêm dự án ' + name));
        state.selectedProjectId = '';
        renderProjectPicker();
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.btnSubmitProject.disabled = false;
      }
    });

    // Tab 2: Delete Project (2-step inline confirm)
    el.btnDeleteProject.addEventListener('click', async function () {
      var id = el.projId.value;
      if (!id) return;
      if (!requireSecondTap(el.btnDeleteProject, 'delProj', 'Nhấn lần nữa để xóa', 'Xóa dự án')) {
        return;
      }
      clearEditorError();
      el.btnDeleteProject.disabled = true;
      try {
        await apiMutate('DELETE', '/api/projects/' + encodeURIComponent(id));
        state.selectedProjectId = '';
        showToast('Đã xóa dự án');
        renderProjectPicker();
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.btnDeleteProject.disabled = false;
      }
    });

    // Tab 3: Top-up supplemental pack
    el.formTopup.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      clearEditorError();
      var amount = Number(el.topupAmount.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        showEditorError('Số credit bổ sung phải lớn hơn 0.');
        return;
      }
      var actor = el.topupActor.value.trim();
      saveActor(actor);

      el.btnSubmitTopup.disabled = true;
      try {
        await apiMutate('POST', '/api/topup', {
          amount: Math.round(amount),
          actor: actor || 'Team Media',
          note: el.topupNote.value.trim() || 'Mua gói bổ sung'
        });
        el.topupAmount.value = '';
        el.topupNote.value = '';
        showToast('Đã cộng +' + fmtNum(amount) + ' credit gói bổ sung');
        closeModal();
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.btnSubmitTopup.disabled = false;
      }
    });

    // Tab 3: Update Account & Cycle Config
    el.formConfig.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      clearEditorError();
      var quota = Math.round(Number(el.cfgQuota.value));
      var resetDay = Math.round(Number(el.cfgResetDay.value));
      if (!Number.isFinite(quota) || quota <= 0) {
        showEditorError('Hạn mức tháng không hợp lệ.');
        return;
      }
      if (!Number.isFinite(resetDay) || resetDay < 1 || resetDay > 31) {
        showEditorError('Ngày reset hợp lệ từ 1 đến 31.');
        return;
      }

      el.btnSubmitConfig.disabled = true;
      try {
        await apiMutate('PATCH', '/api/config', {
          monthly_quota: quota,
          reset_day: resetDay,
          account_name: el.cfgAccount.value.trim(),
          plan_name: el.cfgPlan.value.trim(),
          priority_note: el.cfgNote.value.trim()
        });
        showToast('Đã lưu cấu hình chu kỳ');
        closeModal();
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.btnSubmitConfig.disabled = false;
      }
    });

    // Tab 3: Reset New Cycle (2-step inline confirm)
    el.btnResetCycle.addEventListener('click', async function () {
      if (!requireSecondTap(el.btnResetCycle, 'resetCycle', 'Nhấn lại để xác nhận Reset', 'Reset chu kỳ mới')) {
        return;
      }
      clearEditorError();
      el.btnResetCycle.disabled = true;
      try {
        await apiMutate('PATCH', '/api/config', {
          action: 'reset_cycle',
          actor: getSavedActor() || 'Team Media'
        });
        showToast('Đã reset chu kỳ tháng mới');
        closeModal();
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.btnResetCycle.disabled = false;
      }
    });

    // Tab 3: Custom Backend API URL override
    el.btnSaveApi.addEventListener('click', function () {
      var val = el.customApiInput.value.trim();
      CFG.setCustomApiBase(val);
      updateApiDisplay();
      state.sseRetryDelay = 1200;
      fetchState(true).then(function () {
        connectSSE();
      });
      showToast('Đã đổi máy chủ API: ' + CFG.getApiModeLabel());
    });

    // Reconnect cleanly when tab returns to foreground
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        updateRelativeTimestamp();
        if (!state.sse || state.sse.readyState === 2) {
          fetchState(false).finally(connectSSE);
        }
      }
    });
  }

  /* ========================================================================
     Bootstrap
     ======================================================================== */
  function init() {
    cacheElements();
    initTheme();
    updateApiDisplay();
    bindEvents();

    // Refresh relative timestamps gently every 20s
    setInterval(updateRelativeTimestamp, 20000);

    // Fetch initial state immediately, then open SSE realtime stream
    fetchState(true).finally(function () {
      connectSSE();
    });

    // Check saved/desktop PIN silently in background
    tryAutoUnlock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
