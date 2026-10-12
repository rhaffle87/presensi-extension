/**
 * i18n.js — Internationalization module for Attendance GPS Spoofer
 *
 * Provides bidirectional localization for English (en) and Indonesian (id).
 * Compatible with Node.js test runner and browser script tags.
 */

'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.I18N = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DICTIONARY = {
    en: {
      // Header & System
      app_title: 'Attendance Spoofer',
      app_subtitle: 'Campus Attendance Bridge',
      status_active: 'Active',
      status_inactive: 'Inactive',
      toggle_spoof_aria: 'Toggle Geolocation Spoofing',
      theme_auto: 'Auto',
      theme_light: 'Light',
      theme_dark: 'Dark',
      lang_label: 'Language',
      settings_title: 'Settings',

      // Tabs
      tab_location: 'Location & Presets',
      tab_telemetry: 'Telemetry & Tools',

      // Map & Coords
      map_preview: 'Map Preview',
      latitude: 'Latitude',
      longitude: 'Longitude',
      campus_presets: 'Campus Presets (Main Campus)',
      custom_presets: 'Custom Presets',
      my_location: 'Set to Current Real Location',
      save_apply: 'Save & Apply Coordinates',

      // Telemetry & Diagnostic Ribbon
      engine_telemetry: 'Engine Telemetry',
      active_profile: 'Active Profile',
      velocity_limiter: 'Velocity Limiter',
      vpn_guard: 'VPN Geofence Guard',
      device_mode: 'Device Mode',
      diagnostic_section: 'Diagnostic & Leak Testing',
      btn_browserleaks: 'Browserleaks Test',
      btn_html5: 'HTML5 Geo Demo',
      diag_gps_label: 'GPS Hook Status',
      diag_ip_label: 'Campus IP Check',
      diag_last_submit: 'Last Submitted',
      diag_advisory: 'Always verify location on testbed sites before opening the campus portal.',

      // Swarm Peer Sync
      peer_sync_title: 'Swarm Peer Sync',
      peer_badge_mesh: 'Mesh KV',
      peer_class_placeholder: 'Course Code (e.g. CS101)',
      peer_code_placeholder: '6-digit OTP',
      btn_share_code: 'Share Code',
      btn_refresh_feed: 'Refresh Feed',
      peer_no_codes: 'No peer codes fetched yet.',
      vpn_link_btn: 'Get Campus VPN Config (.ovpn)',

      // Toasts & Notifications
      toast_saved: 'Coordinates saved successfully',
      toast_invalid_coords: 'Invalid coordinates provided',
      toast_impossible_travel: 'Warning: Impossible travel detected (>100 km/h)',
      toast_code_shared: 'Attendance code shared to swarm',
      toast_code_invalid: 'Code must be 6 numeric digits',
      toast_feed_updated: 'Peer code feed updated',
      toast_reset: 'Reset to default coordinates',

      // Options Page
      nav_preferences: 'Preferences',
      nav_custom_presets: 'Custom Presets',
      nav_timetable: 'Class Timetable',
      nav_backup_restore: 'Backup & Restore',
      nav_management: 'Management',
      nav_log: 'Submission Log',
      nav_systems: 'How It Works',
      nav_risks: 'Risks & Policies',
      nav_qna: 'Q&A',

      opt_header_title: 'Options & Help',
      opt_header_sub: 'Attendance Spoofer Documentation & Settings',
      opt_pref_title: 'Preferences',
      opt_default_lat: 'Default Latitude',
      opt_default_lng: 'Default Longitude',
      opt_target_domain: 'Target Domain',
      opt_target_domain_desc: 'Only applies spoofing when browsing this exact domain.',
      opt_relay_url: 'OTP Peer Relay URL',
      opt_relay_desc: 'Cloudflare Worker endpoint for peer mesh attendance sharing.',
      opt_acc_profile: 'Accuracy Profile',
      opt_dev_mode: 'Device Emulation Mode',
      opt_language: 'Interface Language',
      opt_btn_save: 'Save Preferences',

      opt_presets_title: 'Custom Campus Presets',
      opt_preset_name: 'Preset Name',
      opt_preset_lat: 'Latitude',
      opt_preset_lng: 'Longitude',
      opt_preset_radius: 'Geofence Radius (m)',
      opt_preset_regex: 'Auto-Match Regex',
      opt_preset_btn_add: 'Add Custom Preset',

      opt_tt_title: 'Academic Timetable (Auto-Match)',
      opt_tt_day: 'Day',
      opt_tt_start: 'Start Time',
      opt_tt_end: 'End Time',
      opt_tt_subject: 'Subject / Course',
      opt_tt_preset: 'Assigned Preset',
      opt_tt_btn_add: 'Add Timetable Slot',

      opt_backup_title: 'Backup & Restore',
      opt_backup_export: 'Export Backup JSON',
      opt_backup_import: 'Import Backup JSON',

      opt_log_title: 'Submission Log',
      opt_log_export_csv: 'Export CSV',
      opt_log_export_json: 'Export JSON',
      opt_log_clear: 'Clear Log',
      opt_log_empty: 'No attendance submissions recorded yet.',

      // Days of week
      day_sun: 'Sunday',
      day_mon: 'Monday',
      day_tue: 'Tuesday',
      day_wed: 'Wednesday',
      day_thu: 'Thursday',
      day_fri: 'Friday',
      day_sat: 'Saturday',
    },

    id: {
      // Header & System
      app_title: 'Presensi Spoofer',
      app_subtitle: 'Jembatan Presensi Kampus',
      status_active: 'Aktif',
      status_inactive: 'Tidak Aktif',
      toggle_spoof_aria: 'Aktifkan/Matikan Spoofing Geolocation',
      theme_auto: 'Sistem',
      theme_light: 'Terang',
      theme_dark: 'Gelap',
      lang_label: 'Bahasa',
      settings_title: 'Pengaturan',

      // Tabs
      tab_location: 'Lokasi & Preset',
      tab_telemetry: 'Telemetri & Alat',

      // Map & Coords
      map_preview: 'Pratinjau Peta',
      latitude: 'Garis Lintang (Lat)',
      longitude: 'Garis Bujur (Lng)',
      campus_presets: 'Preset Kampus (Kampus Utama)',
      custom_presets: 'Preset Khusus',
      my_location: 'Gunakan Lokasi Asli Saat Ini',
      save_apply: 'Simpan & Terapkan Koordinat',

      // Telemetry & Diagnostic Ribbon
      engine_telemetry: 'Telemetri Engine',
      active_profile: 'Profil Aktif',
      velocity_limiter: 'Pembatas Kecepatan',
      vpn_guard: 'Pengaman VPN Kampus',
      device_mode: 'Mode Perangkat',
      diagnostic_section: 'Uji Diagnostik & Kebocoran',
      btn_browserleaks: 'Uji Browserleaks',
      btn_html5: 'Uji Demo HTML5',
      diag_gps_label: 'Status Hook GPS',
      diag_ip_label: 'Cek IP Kampus',
      diag_last_submit: 'Terakhir Dikirim',
      diag_advisory: 'Selalu verifikasi koordinat pada situs diagnostik sebelum membuka portal presensi.',

      // Swarm Peer Sync
      peer_sync_title: 'Sinkronisasi Peer Swarm',
      peer_badge_mesh: 'Mesh KV',
      peer_class_placeholder: 'Kode Matakuliah (mis. IF101)',
      peer_code_placeholder: '6 digit OTP',
      btn_share_code: 'Bagikan Kode',
      btn_refresh_feed: 'Segarkan Feed',
      peer_no_codes: 'Belum ada kode peer tersinkron.',
      vpn_link_btn: 'Unduh Konfigurasi VPN Kampus (.ovpn)',

      // Toasts & Notifications
      toast_saved: 'Koordinat berhasil disimpan',
      toast_invalid_coords: 'Koordinat yang dimasukkan tidak valid',
      toast_impossible_travel: 'Peringatan: Perjalanan mustahil terdeteksi (>100 km/jam)',
      toast_code_shared: 'Kode presensi berhasil dibagikan ke swarm',
      toast_code_invalid: 'Kode harus berupa 6 digit angka',
      toast_feed_updated: 'Daftar kode peer diperbarui',
      toast_reset: 'Koordinat direset ke nilai default',

      // Options Page
      nav_preferences: 'Preferensi',
      nav_custom_presets: 'Preset Khusus',
      nav_timetable: 'Jadwal Kuliah',
      nav_backup_restore: 'Cadangkan & Pulihkan',
      nav_management: 'Manajemen',
      nav_log: 'Riwayat Presensi',
      nav_systems: 'Cara Kerja',
      nav_risks: 'Risiko & Kebijakan',
      nav_qna: 'Tanya Jawab',

      opt_header_title: 'Pengaturan & Dokumentasi',
      opt_header_sub: 'Dokumentasi & Konfigurasi Attendance Spoofer',
      opt_pref_title: 'Preferensi',
      opt_default_lat: 'Latitude Default',
      opt_default_lng: 'Longitude Default',
      opt_target_domain: 'Domain Target',
      opt_target_domain_desc: 'Spoofing hanya aktif saat membuka domain ini secara spesifik.',
      opt_relay_url: 'URL Relay Peer OTP',
      opt_relay_desc: 'Endpoint Cloudflare Worker untuk sinkronisasi kode presensi peer swarm.',
      opt_acc_profile: 'Profil Akurasi GPS',
      opt_dev_mode: 'Mode Emulasi Perangkat',
      opt_language: 'Bahasa Tampilan',
      opt_btn_save: 'Simpan Preferensi',

      opt_presets_title: 'Preset Kampus Khusus',
      opt_preset_name: 'Nama Preset',
      opt_preset_lat: 'Latitude',
      opt_preset_lng: 'Longitude',
      opt_preset_radius: 'Radius Geofence (m)',
      opt_preset_regex: 'Pencocok Regex Otomatis',
      opt_preset_btn_add: 'Tambah Preset Khusus',

      opt_tt_title: 'Jadwal Kuliah Akademik (Auto-Match)',
      opt_tt_day: 'Hari',
      opt_tt_start: 'Waktu Mulai',
      opt_tt_end: 'Waktu Selesai',
      opt_tt_subject: 'Mata Kuliah',
      opt_tt_preset: 'Preset Lokasi',
      opt_tt_btn_add: 'Tambah Jadwal',

      opt_backup_title: 'Cadangkan & Pulihkan',
      opt_backup_export: 'Ekspor Cadangan JSON',
      opt_backup_import: 'Impor Cadangan JSON',

      opt_log_title: 'Riwayat Presensi',
      opt_log_export_csv: 'Ekspor CSV',
      opt_log_export_json: 'Ekspor JSON',
      opt_log_clear: 'Hapus Riwayat',
      opt_log_empty: 'Belum ada pengiriman presensi yang tercatat.',

      // Days of week
      day_sun: 'Minggu',
      day_mon: 'Senin',
      day_tue: 'Selasa',
      day_wed: 'Rabu',
      day_thu: 'Kamis',
      day_fri: 'Jumat',
      day_sat: 'Sabtu',
    }
  };

  let currentLang = 'en';

  function normalizeLang(lang) {
    if (!lang || typeof lang !== 'string') return 'en';
    const lower = lang.toLowerCase();
    if (lower === 'id' || lower === 'ind' || lower.startsWith('id')) return 'id';
    return 'en';
  }

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    currentLang = normalizeLang(lang);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLang;
    }
    return currentLang;
  }

  function t(key, fallback = '') {
    const dict = DICTIONARY[currentLang] || DICTIONARY.en;
    if (dict && typeof dict[key] === 'string') return dict[key];
    if (DICTIONARY.en && typeof DICTIONARY.en[key] === 'string') return DICTIONARY.en[key];
    return fallback || key;
  }

  function applyToDOM(rootElement = null) {
    if (typeof document === 'undefined') return;
    const root = rootElement || document;

    // Text translations
    const elements = root.querySelectorAll('[data-i18n]');
    elements.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const translated = t(key);
        // If element contains child elements (like icons/svg), only replace text node if possible
        if (el.children.length === 0) {
          el.textContent = translated;
        } else {
          // Find or update trailing text or span with i18n-text class
          const textSpan = el.querySelector('.i18n-text');
          if (textSpan) {
            textSpan.textContent = translated;
          } else {
            // Replace the last text node
            let replaced = false;
            for (let i = el.childNodes.length - 1; i >= 0; i--) {
              if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) {
                el.childNodes[i].nodeValue = ' ' + translated;
                replaced = true;
                break;
              }
            }
            if (!replaced) el.appendChild(document.createTextNode(' ' + translated));
          }
        }
      }
    });

    // Placeholders
    const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });

    // Titles / Tooltips / ARIA
    const titles = root.querySelectorAll('[data-i18n-title]');
    titles.forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });

    const arias = root.querySelectorAll('[data-i18n-aria]');
    arias.forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    });
  }

  return {
    DICTIONARY,
    normalizeLang,
    getLang,
    setLang,
    t,
    applyToDOM
  };
});
