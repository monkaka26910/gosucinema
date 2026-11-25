/**
 * GOSU Credit Manager — Minimalist Realtime Frontend (v1.1)
 * Zero dependencies · Pure Vanilla JS · SSE Realtime + Pinned-Only Report + Project Logos + Wallet Audit
 */
(function () {
  'use strict';

  var CFG = window.GOSU_CONFIG;
  var NEW_PROJECT_SENTINEL = '__NEW__';
  var DEFAULT_LOG_LIMIT = 8;
  var MAX_LOGO_DATA_URL_BYTES = 195 * 1024;

  var state = {
    snapshot: null,
    auditData: null,
    editPin: '',
    pinVerified: false,
    modalOpen: false,
    activeTab: 'balance',
    balanceSubmode: 'balance',
    auditMode: 'wallet',
    selectedProjectId: '',
    projectLogoUrl: '',
    logsExpanded: false,
    sse: null,
    sseRetryDelay: 1200,
    sseRetryTimer: null,
    pollFallbackTimer: null,
    pendingProjectIdForUsage: null,
    confirmTimers: {},
    toastTimer: null
  };

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
      walletBreakdown: $('wallet-breakdown'),
      progressTrack: $('progress-track'),
      progressFill: $('progress-fill'),
      progressTopupMarker: $('progress-topup-marker'),
      kpiUsed: $('kpi-used'),
      kpiUsedPct: $('kpi-used-pct'),
      kpiResetDate: $('kpi-reset-date'),
      kpiDaysLeft: $('kpi-days-left'),
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
      tabAudit: $('tab-audit'),
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
      projPinStatusBadge: $('proj-pin-status-badge'),
      formProject: $('form-project'),
      projId: $('proj-id'),
      projLogoPreview: $('proj-logo-preview'),
      projLogoFile: $('proj-logo-file'),
      btnUploadLogo: $('btn-upload-logo'),
      btnClearLogo: $('btn-clear-logo'),
      projLogoUrl: $('proj-logo-url'),
      projLogoHint: $('proj-logo-hint'),
      projName: $('proj-name'),
      projCredits: $('proj-credits'),
      projStatus: $('proj-status'),
      projOwner: $('proj-owner'),
      projNote: $('proj-note'),
      projPinned: $('proj-pinned'),
      projPriority: $('proj-priority'),
      btnDeleteProject: $('btn-delete-project'),
      btnSubmitProject: $('btn-submit-project'),

      auditLedgerSpend: $('audit-ledger-spend'),
      auditPinnedSpend: $('audit-pinned-spend'),
      auditDiffSpend: $('audit-diff-spend'),
      auditWalletLine: $('audit-wallet-line'),
      auditLastTime: $('audit-last-time'),
      btnRefreshAudit: $('btn-refresh-audit'),
      formAuditParse: $('form-audit-parse'),
      auditProjectWrap: $('audit-project-wrap'),
      auditProject: $('audit-project'),
      auditTextLabel: $('audit-text-label'),
      auditRawText: $('audit-raw-text'),
      auditApply: $('audit-apply'),
      btnSubmitAudit: $('btn-submit-audit'),
      auditEntriesCount: $('audit-entries-count'),
      auditEntriesList: $('audit-entries-list'),

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

  function isSafeImageUrl(url) {
    var s = String(url || '').trim();
    if (!s) return false;
    if (/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(s)) return true;
    if (/^https?:\/\//i.test(s)) return true;
    if (/^\.\//.test(s)) return true;
    return false;
  }

  function getProjectInitials(name) {
    var clean = String(name || '').trim();
    if (!clean) return 'PJ';
    var words = clean.split(/[\s/\-_]+/).filter(Boolean);
    if (words.length >= 2) {
      var a = Array.from(words[0])[0] || '';
      var b = Array.from(words[1])[0] || '';
      return (a + b).toUpperCase();
    }
    var chars = Array.from(clean);
    return chars.slice(0, 2).join('').toUpperCase();
  }

  function parseDateSafe(iso) {
    if (!iso) return null;
    var s = String(iso).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var parts = s.split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)) {
      s = s.replace(' ', 'T');
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
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
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
    if (!d) return String(iso || '—').slice(0, 16);
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatAuditEntryTime(ts) {
    var raw = String(ts || '').trim();
    var m = raw.match(/^\d{4}-(\d{2})-(\d{2})[T\s](\d{2}:\d{2})/);
    if (m) return m[2] + '/' + m[1] + ' ' + m[3];
    return formatCompactLogTime(raw);
  }

  function getHealthLevel(remainingPct) {
    var p = Number(remainingPct);
    if (Number.isFinite(p)) {
      if (p < 15) return 'critical';
      if (p <= 35) return 'watch';
      return 'safe';
    }
    return 'safe';
  }

  function syncSourceLabel(source) {
    var s = String(source || '').toLowerCase();
    if (s.indexOf('dreamina') !== -1 || s.indexOf('ext') !== -1 || s.indexOf('auto') !== -1) {
      return 'Auto Sync';
    }
    if (s.indexOf('audit') !== -1) {
      return 'Rà soát ví';
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
     Theme Toggle (SVGElement-safe toggleAttribute + declarative CSS)
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
     Normalize Backend Snapshot (v1.1: wallet breakdown, pinned, logo_url, report)
     ======================================================================== */
  function normalizeProject(p) {
    return {
      id: String(p.id != null ? p.id : p.name),
      name: String(p.name || 'Chưa đặt tên'),
      priority: Boolean(p.priority),
      pinned: p.pinned === undefined ? true : Boolean(p.pinned),
      logo_url: isSafeImageUrl(p.logo_url) ? String(p.logo_url).trim() : '',
      status: p.status === 'done' || p.status === 'paused' ? p.status : 'active',
      credits_used: Number(p.credits_used != null ? p.credits_used : 0),
      owner: p.owner || '',
      note: p.note || ''
    };
  }

  function sortProjectsForReport(list) {
    return list.slice().sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      var statusWeight = { active: 0, paused: 1, done: 2 };
      var sa = statusWeight[a.status] != null ? statusWeight[a.status] : 0;
      var sb = statusWeight[b.status] != null ? statusWeight[b.status] : 0;
      if (sa !== sb) return sa - sb;
      if (b.credits_used !== a.credits_used) return b.credits_used - a.credits_used;
      return a.name.localeCompare(b.name, 'vi');
    });
  }

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

    var hasWalletBreakdown = (
      acc.subscription_credits != null ||
      acc.purchased_credits != null ||
      acc.daily_free_credits != null
    );

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
      has_wallet_breakdown: hasWalletBreakdown,
      subscription_credits: acc.subscription_credits != null ? Number(acc.subscription_credits) : null,
      purchased_credits: acc.purchased_credits != null ? Number(acc.purchased_credits) : null,
      daily_free_credits: acc.daily_free_credits != null ? Number(acc.daily_free_credits) : null,
      reset_day: Number(acc.reset_day != null ? acc.reset_day : 4),
      next_reset_date: acc.next_reset_date || '',
      days_until_reset: acc.days_until_reset != null ? Number(acc.days_until_reset) : null,
      priority_note: acc.priority_note != null ? acc.priority_note : '',
      last_audit_at: acc.last_audit_at || '',
      last_updated_at: acc.last_synced_at || acc.updated_at || (raw.sync_meta && raw.sync_meta.last_synced_at) || raw.server_time || '',
      last_sync_source: acc.last_sync_source || acc.sync_source || (raw.sync_meta && raw.sync_meta.last_sync_source) || 'manual'
    };

    var allProjectsRaw = Array.isArray(raw.projects) ? raw.projects : [];
    var allProjects = allProjectsRaw.map(normalizeProject).sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      if (b.credits_used !== a.credits_used) return b.credits_used - a.credits_used;
      return a.name.localeCompare(b.name, 'vi');
    });

    var pinnedRaw = Array.isArray(raw.pinned_projects)
      ? raw.pinned_projects.map(normalizeProject).filter(function (p) { return p.pinned !== false; })
      : allProjects.filter(function (p) { return p.pinned !== false; });
    var pinnedProjects = sortProjectsForReport(pinnedRaw);

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
      projects: allProjects,
      pinned_projects: pinnedProjects,
      report: raw.report || null,
      logs: logs,
      server_time: raw.server_time || ''
    };
  }

  /* ========================================================================
     Render Dashboard (Observation-First, Pinned-Only Report, Zero Clutter)
     ======================================================================== */
  function renderSnapshot(nextRaw, isRealtimeUpdate) {
    var next = normalizeSnapshot(nextRaw);
    if (!next) return;

    var prev = state.snapshot;
    state.snapshot = next;

    var acc = next.account;
    var level = getHealthLevel(acc.remaining_pct);

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

    // Quiet inline wallet breakdown
    if (acc.has_wallet_breakdown) {
      var subVal = acc.subscription_credits != null ? fmtNum(acc.subscription_credits) : '0';
      var purVal = acc.purchased_credits != null ? fmtNum(acc.purchased_credits) : '0';
      var dayVal = acc.daily_free_credits != null ? fmtNum(acc.daily_free_credits) : '0';
      el.walletBreakdown.hidden = false;
      el.walletBreakdown.textContent = 'Đăng ký ' + subVal + ' · Đã mua ' + purVal + ' · Tặng ngày ' + dayVal;
    } else {
      el.walletBreakdown.hidden = true;
    }

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

    // 2 Clean Inline KPIs (Đã dùng + Reset chu kỳ)
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

    // Priority Note
    if (acc.priority_note && acc.priority_note.trim()) {
      el.priorityNoteWrap.hidden = false;
      el.priorityNote.textContent = acc.priority_note.trim();
    } else {
      el.priorityNoteWrap.hidden = true;
    }

    // Pinned-Only Projects List
    renderProjects(next.pinned_projects, prev ? prev.pinned_projects : null, isRealtimeUpdate);

    // Recent Updates Timeline
    renderLogs(next.logs);

    // Refresh open modal selectors & live audit tab on SSE updates
    if (state.modalOpen && state.pinVerified) {
      refreshModalSelectorsOnly();
      if (state.activeTab === 'audit' && isRealtimeUpdate) {
        fetchAuditData(false);
      }
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

  function renderProjects(pinnedProjects, prevPinned, isRealtimeUpdate) {
    el.projectsCount.textContent = String(pinnedProjects.length);

    // Compute total strictly from pinned projects only
    var totalPinnedCredits = pinnedProjects.reduce(function (sum, p) {
      return sum + Math.max(0, p.credits_used);
    }, 0);

    var denominator = Math.max(totalPinnedCredits, 1);
    el.projectsTotalMeta.textContent = totalPinnedCredits > 0
      ? ('Tổng phân bổ: ' + fmtNum(totalPinnedCredits) + ' credit')
      : '';

    if (!pinnedProjects.length) {
      el.projectsList.innerHTML = '<div class="empty-state">Chưa có dự án nào được ghim lên báo cáo. Mở “Cập nhật → Dự án” để ghim dự án.</div>';
      return;
    }

    var prevMap = {};
    if (prevPinned) {
      prevPinned.forEach(function (p) { prevMap[p.id] = p.credits_used; });
    }

    var html = pinnedProjects.map(function (p) {
      var sharePct = totalPinnedCredits > 0 ? (p.credits_used / totalPinnedCredits) * 100 : 0;
      var barPct = Math.max(p.credits_used > 0 ? 3 : 0, Math.min(100, (p.credits_used / denominator) * 100));
      var metaParts = [];
      if (p.owner) metaParts.push(p.owner);
      if (p.note) metaParts.push(p.note);
      var metaStr = metaParts.join(' · ') || 'Nhấn để ghi nhận credit';
      var changed = isRealtimeUpdate && prevMap[p.id] != null && prevMap[p.id] !== p.credits_used;
      var initials = getProjectInitials(p.name);
      var hasLogo = Boolean(p.logo_url);

      var logoHtml = hasLogo
        ? '<div class="project-logo" data-has-img="true" data-initials="' + escapeHtml(initials) + '">' +
            '<img class="project-logo-img" src="' + escapeHtml(p.logo_url) + '" alt="" loading="lazy" />' +
          '</div>'
        : '<div class="project-logo" data-has-img="false">' + escapeHtml(initials) + '</div>';

      return (
        '<button type="button" class="project-row" data-project-id="' + escapeHtml(p.id) + '" ' +
        'data-priority="' + (p.priority ? 'true' : 'false') + '" data-status="' + escapeHtml(p.status) + '" ' +
        'title="Nhấn để ghi nhận nhanh credit cho ' + escapeHtml(p.name) + '">' +
          '<div class="project-identity">' +
            logoHtml +
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

    // Graceful fallback if any remote logo image fails to load
    el.projectsList.querySelectorAll('.project-logo-img').forEach(function (img) {
      img.addEventListener('error', function () {
        var box = img.parentElement;
        if (!box) return;
        box.setAttribute('data-has-img', 'false');
        box.textContent = box.getAttribute('data-initials') || 'PJ';
      }, { once: true });
    });
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
      } else if (ev.indexOf('audit') !== -1) {
        kind = 'sync';
        badgeText = d === 0 ? 'Rà soát' : (d > 0 ? '+' + fmtNum(d) : '-' + fmtNum(Math.abs(d)));
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
     Audit Tab (GET /api/audit & POST /api/audit/parse-text)
     ======================================================================== */
  async function fetchAuditData(showError) {
    try {
      var res = await fetch(CFG.apiUrl('/api/audit'), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      state.auditData = data;
      renderAuditPanel(data);
      return data;
    } catch (err) {
      if (showError) {
        showEditorError('Không thể tải dữ liệu rà soát ví (' + err.message + ').');
      }
      renderAuditPanel(state.auditData);
      return null;
    }
  }

  function renderAuditPanel(data) {
    var summary = (data && data.summary) || {};
    var wallet = (data && data.wallet) || (state.snapshot && state.snapshot.account) || {};
    var entries = (data && (data.recent_entries || data.entries)) || [];

    var ledgerSpend = summary.ledger_spend != null
      ? Number(summary.ledger_spend)
      : (summary.wallet_ledger_spend != null
        ? Number(summary.wallet_ledger_spend)
        : (summary.total_ledger_spend != null ? Number(summary.total_ledger_spend) : null));

    var pinnedSpend = summary.pinned_spend != null
      ? Number(summary.pinned_spend)
      : (summary.pinned_sessions_spend != null
        ? Number(summary.pinned_sessions_spend)
        : (summary.reconciled_pinned_spend != null ? Number(summary.reconciled_pinned_spend) : null));

    var diffSpend = summary.unpinned_or_unmatched_spend != null
      ? Number(summary.unpinned_or_unmatched_spend)
      : (summary.unmatched_spend != null
        ? Number(summary.unmatched_spend)
        : (summary.unpinned_spend != null
          ? Number(summary.unpinned_spend)
          : (ledgerSpend != null && pinnedSpend != null ? Math.max(0, ledgerSpend - pinnedSpend) : null)));

    el.auditLedgerSpend.textContent = ledgerSpend != null ? fmtNum(ledgerSpend) : '—';
    el.auditPinnedSpend.textContent = pinnedSpend != null ? fmtNum(pinnedSpend) : '—';
    el.auditDiffSpend.textContent = diffSpend != null ? fmtNum(diffSpend) : '—';

    if (diffSpend != null) {
      el.auditDiffSpend.setAttribute('data-tone', diffSpend > 0 ? 'watch' : 'safe');
    } else {
      el.auditDiffSpend.removeAttribute('data-tone');
    }

    var subW = wallet.subscription_credits != null ? fmtNum(wallet.subscription_credits) : '—';
    var purW = wallet.purchased_credits != null ? fmtNum(wallet.purchased_credits) : '—';
    var dayW = wallet.daily_free_credits != null ? fmtNum(wallet.daily_free_credits) : '—';
    el.auditWalletLine.textContent = 'Đăng ký ' + subW + ' · Đã mua ' + purW + ' · Tặng ngày ' + dayW;

    var lastAt = summary.last_audit_at || wallet.last_audit_at || (state.snapshot && state.snapshot.account.last_audit_at) || '';
    el.auditLastTime.textContent = lastAt
      ? ('Rà soát gần nhất: ' + formatRelativeTime(lastAt) + ' (' + formatFullTime(lastAt) + ')')
      : 'Chưa có lần rà soát nào trong chu kỳ này';

    el.auditEntriesCount.textContent = entries.length + ' mục';

    if (!entries.length) {
      el.auditEntriesList.innerHTML = '<div class="empty-state compact">Chưa có bản ghi rà soát ví nào. Dán lịch sử Dreamina ở trên để đối chiếu ngay.</div>';
      return;
    }

    el.auditEntriesList.innerHTML = entries.slice(0, 25).map(function (entry) {
      var ts = entry.occurred_at || entry.created_at || '';
      var delta = Number(entry.delta != null ? entry.delta : (entry.credits_used != null ? -Math.abs(Number(entry.credits_used)) : 0));
      var signAttr = delta > 0 ? 'pos' : (delta < 0 ? 'neg' : 'zero');
      var deltaStr = delta > 0 ? ('+' + fmtNum(delta)) : (delta < 0 ? ('-' + fmtNum(Math.abs(delta))) : '0');

      var title = entry.project_name || entry.session_name || entry.label || 'Mục ví';
      if (entry.project_name && entry.label && entry.label.toLowerCase().indexOf(entry.project_name.toLowerCase()) === -1) {
        title = entry.project_name + ' · ' + entry.label;
      }

      var statusText = 'Chưa ghim';
      var matchAttr = 'unmatched';
      var ms = String(entry.match_status || '').toLowerCase();
      var lblLower = String(entry.label || '').toLowerCase();
      if (ms === 'daily_free' || lblLower.indexOf('miễn phí') !== -1 || lblLower.indexOf('daily') !== -1) {
        statusText = 'Tặng ngày';
        matchAttr = 'daily';
      } else if (ms === 'matched' || entry.matched || entry.matched_entry_id) {
        statusText = 'Đã khớp';
        matchAttr = 'matched';
      } else if (ms === 'session_only' || entry.project_id) {
        statusText = 'Phiên ghim';
        matchAttr = 'matched';
      }

      return (
        '<div class="audit-entry-row" title="' + escapeHtml((ts ? ts + ' — ' : '') + title) + '">' +
          '<span class="audit-entry-time tabular">' + escapeHtml(formatAuditEntryTime(ts)) + '</span>' +
          '<span class="audit-entry-title">' + escapeHtml(title) + '</span>' +
          '<span class="audit-entry-delta tabular" data-sign="' + signAttr + '">' + escapeHtml(deltaStr) + '</span>' +
          '<span class="audit-match-pill" data-match="' + matchAttr + '">' + escapeHtml(statusText) + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function switchAuditMode(mode) {
    state.auditMode = mode === 'session' ? 'session' : 'wallet';
    el.tabAudit.querySelectorAll('[data-audit-mode]').forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.getAttribute('data-audit-mode') === state.auditMode ? 'true' : 'false');
    });
    var isSession = state.auditMode === 'session';
    el.auditProjectWrap.hidden = !isSession;
    el.auditProject.required = isSession;
    el.auditTextLabel.textContent = isSession
      ? 'Nội dung sao chép từ “Chi tiết (i)” trong phiên tạo Dreamina'
      : 'Nội dung sao chép từ “Mức sử dụng điểm tín dụng” trên Dreamina';
    el.auditRawText.placeholder = isSession
      ? 'Dán văn bản chứa "Đã tạo lúc YYYY-MM-DD HH:MM" và "Số điểm tín dụng đã dùng 270"...'
      : 'Dán toàn bộ bảng lịch sử từ modal "Mức sử dụng điểm tín dụng" trên Dreamina...';
  }

  /* ========================================================================
     Client-Side Logo Image Resize (Center Square Crop -> 128x128 Data URL)
     ======================================================================== */
  function processLogoFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('Vui lòng chọn tệp ảnh hợp lệ (PNG, JPG, WebP).'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Không đọc được tệp ảnh.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Định dạng ảnh không được hỗ trợ.')); };
        img.onload = function () {
          try {
            var size = 128;
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            var side = Math.min(img.width, img.height);
            var sx = Math.floor((img.width - side) / 2);
            var sy = Math.floor((img.height - side) / 2);
            ctx.clearRect(0, 0, size, size);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

            var dataUrl = canvas.toDataURL('image/webp', 0.86);
            if (!dataUrl || dataUrl.indexOf('data:image/webp') !== 0) {
              dataUrl = canvas.toDataURL('image/png');
            }
            if (dataUrl.length > MAX_LOGO_DATA_URL_BYTES) {
              dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            }
            if (dataUrl.length > MAX_LOGO_DATA_URL_BYTES) {
              reject(new Error('Ảnh sau nén vẫn quá lớn (>200KB), vui lòng chọn ảnh khác.'));
              return;
            }
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  function renderProjectLogoPreview() {
    var url = state.projectLogoUrl;
    var initials = getProjectInitials(el.projName.value || 'PJ');

    if (url && isSafeImageUrl(url)) {
      el.projLogoPreview.innerHTML = '<img src="' + escapeHtml(url) + '" alt="Logo dự án" />';
      var previewImg = el.projLogoPreview.querySelector('img');
      if (previewImg) {
        previewImg.addEventListener('error', function () {
          el.projLogoPreview.textContent = initials;
        }, { once: true });
      }
      el.btnClearLogo.hidden = false;
      if (url.indexOf('data:image/') === 0) {
        el.projLogoHint.textContent = 'Đã tải ảnh lên (128×128, ' + Math.max(1, Math.round(url.length / 1024)) + ' KB).';
      } else {
        el.projLogoHint.textContent = 'Đang dùng ảnh từ URL.';
      }
    } else {
      el.projLogoPreview.textContent = initials;
      el.btnClearLogo.hidden = true;
      el.projLogoHint.textContent = 'Ảnh tải lên tự động cắt vuông 128×128 gọn nhẹ.';
    }
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
      } catch (_) {}
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
    switchAuditMode(state.auditMode);

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

    el.editorWorkspace.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.getAttribute('data-tab') === tabName ? 'true' : 'false');
    });

    el.tabBalance.hidden = tabName !== 'balance';
    el.tabProjects.hidden = tabName !== 'projects';
    el.tabAudit.hidden = tabName !== 'audit';
    el.tabCycle.hidden = tabName !== 'cycle';

    if (tabName === 'projects') {
      renderProjectPicker();
    } else if (tabName === 'audit') {
      switchAuditMode(state.auditMode);
      fetchAuditData(false);
    } else if (tabName === 'cycle') {
      populateConfigForm();
      updateApiDisplay();
    }
  }

  function switchBalanceSubmode(mode) {
    state.balanceSubmode = mode;
    clearEditorError();
    el.tabBalance.querySelectorAll('[data-submode]').forEach(function (btn) {
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
    var allProjects = state.snapshot ? state.snapshot.projects : [];
    var pinnedProjects = state.snapshot ? state.snapshot.pinned_projects : [];

    var prevBalProj = el.balProject.value;
    el.balProject.innerHTML = '<option value="">Không gán dự án cụ thể</option>' +
      allProjects.map(function (p) {
        var suffix = (p.priority ? ' ★' : '') + (p.pinned ? '' : ' (Chưa ghim)');
        return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + suffix + '</option>';
      }).join('');
    if (prevBalProj) el.balProject.value = prevBalProj;

    var prevUsageProj = el.usageProject.value;
    el.usageProject.innerHTML = allProjects.map(function (p) {
      var suffix = (p.priority ? ' ★' : '') + (p.pinned ? '' : ' (Chưa ghim)');
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + suffix + '</option>';
    }).join('') + '<option value="' + NEW_PROJECT_SENTINEL + '">+ Tạo dự án mới...</option>';
    if (prevUsageProj && Array.prototype.some.call(el.usageProject.options, function (o) { return o.value === prevUsageProj; })) {
      el.usageProject.value = prevUsageProj;
    }
    toggleNewProjectInput();

    // Pinned project selector for Audit Tab (session mode)
    var prevAuditProj = el.auditProject.value;
    if (pinnedProjects.length) {
      el.auditProject.innerHTML = pinnedProjects.map(function (p) {
        return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + (p.priority ? ' ★' : '') + '</option>';
      }).join('');
      if (prevAuditProj && Array.prototype.some.call(el.auditProject.options, function (o) { return o.value === prevAuditProj; })) {
        el.auditProject.value = prevAuditProj;
      }
    } else {
      el.auditProject.innerHTML = '<option value="">Chưa có dự án đang ghim</option>';
    }

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
     Tab 2: Project Picker (All Projects + Pin Badge + Logo Control)
     ======================================================================== */
  function updatePinStatusBadge() {
    var isPinned = Boolean(el.projPinned.checked);
    el.projPinStatusBadge.setAttribute('data-pinned', isPinned ? 'true' : 'false');
    el.projPinStatusBadge.textContent = isPinned ? 'Đang ghim' : 'Ẩn khỏi báo cáo';
  }

  function renderProjectPicker() {
    var projects = state.snapshot ? state.snapshot.projects : [];
    var chips = [
      '<button type="button" class="chip-btn" data-pick-project="" data-active="' + (state.selectedProjectId === '' ? 'true' : 'false') + '">+ Dự án mới</button>'
    ];
    projects.forEach(function (p) {
      var active = state.selectedProjectId === p.id;
      var tag = p.pinned
        ? '<span class="chip-pin-tag">Ghim</span>'
        : '<span class="chip-pin-tag">Ẩn</span>';
      chips.push(
        '<button type="button" class="chip-btn" data-pick-project="' + escapeHtml(p.id) + '" data-active="' + (active ? 'true' : 'false') + '">' +
          '<span>' + escapeHtml(p.name) + '</span>' + tag +
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
      el.projPinned.checked = Boolean(found.pinned);
      el.projPriority.checked = Boolean(found.priority);
      state.projectLogoUrl = found.logo_url || '';
      el.projLogoUrl.value = state.projectLogoUrl.indexOf('data:image/') === 0 ? '' : state.projectLogoUrl;
      el.btnDeleteProject.hidden = false;
      el.btnSubmitProject.textContent = 'Lưu thay đổi';
    } else {
      el.projId.value = '';
      el.projName.value = '';
      el.projCredits.value = '0';
      el.projStatus.value = 'active';
      el.projOwner.value = 'Team Media';
      el.projNote.value = '';
      el.projPinned.checked = true;
      el.projPriority.checked = false;
      state.projectLogoUrl = '';
      el.projLogoUrl.value = '';
      el.btnDeleteProject.hidden = true;
      el.btnSubmitProject.textContent = 'Thêm dự án';
    }
    el.projLogoFile.value = '';
    updatePinStatusBadge();
    renderProjectLogoPreview();
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
     Inline 2-Step Confirmation Helper
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

    // Main modal tab switching
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

    el.tabAudit.querySelectorAll('[data-audit-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchAuditMode(btn.getAttribute('data-audit-mode'));
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

    // Tab 2: Project Picker & Logo Controls
    el.projectPicker.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-pick-project]');
      if (!btn) return;
      state.selectedProjectId = btn.getAttribute('data-pick-project') || '';
      renderProjectPicker();
    });

    el.projPinned.addEventListener('change', updatePinStatusBadge);

    el.projName.addEventListener('input', function () {
      if (!state.projectLogoUrl) renderProjectLogoPreview();
    });

    el.btnUploadLogo.addEventListener('click', function () {
      el.projLogoFile.click();
    });

    el.projLogoFile.addEventListener('change', async function () {
      var file = el.projLogoFile.files && el.projLogoFile.files[0];
      if (!file) return;
      clearEditorError();
      try {
        var dataUrl = await processLogoFile(file);
        state.projectLogoUrl = dataUrl;
        el.projLogoUrl.value = '';
        renderProjectLogoPreview();
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.projLogoFile.value = '';
      }
    });

    el.projLogoUrl.addEventListener('input', function () {
      var raw = el.projLogoUrl.value.trim();
      if (raw === '') {
        if (state.projectLogoUrl.indexOf('data:image/') !== 0) {
          state.projectLogoUrl = '';
        }
      } else {
        state.projectLogoUrl = raw;
      }
      renderProjectLogoPreview();
    });

    el.btnClearLogo.addEventListener('click', function () {
      state.projectLogoUrl = '';
      el.projLogoUrl.value = '';
      el.projLogoFile.value = '';
      renderProjectLogoPreview();
    });

    // Tab 2: Save Project (includes pinned + logo_url)
    el.formProject.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      clearEditorError();
      var name = el.projName.value.trim();
      if (!name) {
        showEditorError('Vui lòng nhập tên dự án.');
        return;
      }
      var logoVal = state.projectLogoUrl.trim();
      if (logoVal && !isSafeImageUrl(logoVal)) {
        showEditorError('URL logo không hợp lệ. Vui lòng dùng ảnh tải lên hoặc đường dẫn https://...');
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
          pinned: Boolean(el.projPinned.checked),
          priority: Boolean(el.projPriority.checked),
          logo_url: logoVal
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

    // Tab 3: Refresh Audit & Submit Quick Paste Reconciliation
    el.btnRefreshAudit.addEventListener('click', function () {
      fetchAuditData(true).then(function (d) {
        if (d) showToast('Đã làm mới dữ liệu rà soát ví');
      });
    });

    el.formAuditParse.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      clearEditorError();
      var rawText = el.auditRawText.value.trim();
      if (!rawText) {
        showEditorError('Vui lòng dán nội dung từ Dreamina trước khi rà soát.');
        return;
      }

      el.btnSubmitAudit.disabled = true;
      try {
        var payload = {
          mode: state.auditMode,
          text: rawText,
          apply_to_projects: Boolean(el.auditApply.checked),
          actor: getSavedActor() || 'Team Media'
        };
        if (state.auditMode === 'session' && el.auditProject.value) {
          payload.project_id = String(el.auditProject.value);
        }
        await apiMutate('POST', '/api/audit/parse-text', payload);
        el.auditRawText.value = '';
        await fetchAuditData(false);
        showToast('Đã rà soát & đối chiếu dữ liệu Dreamina');
      } catch (err) {
        showEditorError(err.message);
      } finally {
        el.btnSubmitAudit.disabled = false;
      }
    });

    // Tab 4: Top-up supplemental pack
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

    // Tab 4: Update Account & Cycle Config
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

    // Tab 4: Reset New Cycle (2-step inline confirm)
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

    // Tab 4: Custom Backend API URL override
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

    setInterval(updateRelativeTimestamp, 20000);

    fetchState(true).finally(function () {
      connectSSE();
    });

    tryAutoUnlock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
