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
      badge_optional: 'Optional',
      badge_recommended: 'Recommended',

      // Tabs
      tab_location: 'Location & Presets',
      tab_telemetry: 'Telemetry & Tools',

      // Map & Coords
      map_preview: 'Map Preview',
      latitude: 'Latitude',
      longitude: 'Longitude',
      campus_presets: 'Campus Presets (Main Campus)',
      custom_presets: 'Custom Presets',
      preset_tower1_sub: 'Science',
      preset_tower2_sub: 'Tower 2',
      preset_koridc_sub: 'Class C',
      my_location: 'Set to Current Real Location',
      save_apply: 'Save & Apply Coordinates',

      // Telemetry & Diagnostic Ribbon
      engine_telemetry: 'Stealth Suite',
      stealth_max: 'Maximum',
      active_profile: 'Auto-Room Match',
      auto_room_match: 'Active',
      device_profile: 'Device Profile',
      prof_mobile: 'Mobile GPS (4-10m)',
      prof_desktop: 'Desktop / IP (20-40m)',
      prof_weak: 'Weak Signal (50-120m)',
      velocity_limiter: 'Velocity Limiter',
      vpn_guard: 'VPN Geofence Guard',
      device_mode: 'Device Mode',
      diagnostic_section: 'Diagnostic & Leak Testing',
      btn_browserleaks: 'Browserleaks Test',
      btn_html5: 'HTML5 Geo Demo',
      diag_gps_label: 'HTML5 GPS Hook',
      diag_gps_active: 'ACTIVE (Ready)',
      diag_ip_label: 'Network IP / ISP',
      diag_ip_checking: 'Checking IP...',
      diag_ip_campus_ok: 'Campus Network (OK)',
      diag_ip_external: 'External Network',
      diag_last_submit: 'Last Submission',
      diag_test_mode_toggle: 'Test Mode (All Sites)',
      diag_notice_bold: 'Notice:',
      diag_notice_text: 'Extension mocks navigator.geolocation. Network IP detection on external geo tools requires Campus VPN.',
      diag_verify_title: 'Verify GPS Override',

      // Swarm Peer Sync
      peer_sync_title: 'Live Peer Code Pool',
      peer_badge_mesh: 'KV Sync',
      peer_class_placeholder: 'Class / Subject',
      peer_code_placeholder: '6-Digit Code',
      btn_share_code: 'Broadcast',
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
      toast_campus_verified: 'Campus Network Verified',
      alert_vpn_required: 'Spoof paused: Campus VPN required by settings.',
      alert_open_settings: 'Open Settings',

      // Options Page — Sidebar Navigation
      nav_preferences: 'Preferences',
      nav_custom_presets: 'Custom Presets',
      nav_timetable: 'Class Timetable',
      nav_backup_restore: 'Backup & Restore',
      nav_management: 'Management',
      nav_log: 'Submission Log',
      nav_systems: 'How It Works',
      nav_risks: 'Risks & Policies',
      nav_qna: 'Q&A',

      // Options Page — Preferences
      opt_header_title: 'Options & Help',
      opt_header_sub: 'Attendance Spoofer Documentation & Settings',
      opt_pref_title: 'Preferences',
      opt_default_lat: 'Default Latitude',
      opt_default_lng: 'Default Longitude',
      opt_target_domain: 'Target Domain',
      opt_target_domain_desc: 'Only applies spoofing when browsing this exact domain.',
      opt_relay_url: 'OTP Peer Relay URL',
      opt_relay_desc: 'Cloudflare Worker endpoint. When set, OTP codes and QR tokens are shared with peers in real-time. Leave blank to disable.',
      opt_language: 'Interface Language',
      opt_theme: 'Theme Preference',
      opt_theme_system: 'System Default',
      opt_theme_light: 'Light Mode',
      opt_theme_dark: 'Dark Mode',
      opt_vpn_lock_title: 'VPN / Campus Network Lock',
      opt_vpn_lock_desc: 'When ON, spoofing is blocked if your IP is detected outside the campus network (Wi-Fi or VPN). Turn OFF to allow remote attendance from any network.',
      opt_vpn_warning_lead: 'Network Lock is OFF.',
      opt_vpn_warning_text: 'Spoofing will work from any network. Ensure you have Campus VPN connected if required for portal access, otherwise the portal may still reject you due to IP restrictions.',
      opt_test_mode_title: 'Global Diagnostic Test Mode',
      opt_test_mode_desc: 'When enabled, geolocation spoofing applies to all websites and diagnostic tools (e.g. BrowserLeaks, HTML5 Demos) for quick verification.',
      opt_device_type: 'Spoof Device Type',
      opt_device_desktop: 'Desktop (Default)',
      opt_device_android: 'Android (Galaxy S23)',
      opt_device_ios: 'iOS (iPhone 15 Pro)',
      opt_device_desc: 'Overrides User-Agent and platform to mimic mobile devices on desktop.',
      opt_btn_save: 'Save Preferences',
      opt_saved_status: 'Saved successfully',

      // Options Page — Custom Presets
      opt_presets_title: 'Custom Campus Facility Presets',
      opt_presets_desc: 'Define custom campus facilities, research centers, or department classrooms with designated GPS coordinates. These will appear in the popup quick-select list and be automatically matched by attendance room sniffers.',
      opt_preset_name: 'Facility / Room Name',
      opt_preset_name_ph: 'e.g. Lab Robotika',
      opt_preset_regex: 'Match Regex (Optional)',
      opt_preset_regex_ph: 'e.g. ROBOTIK|ROBOT',
      opt_preset_lat: 'Latitude',
      opt_preset_lng: 'Longitude',
      opt_preset_btn_add: 'Add Custom Preset',
      opt_presets_saved: 'Saved Presets',
      opt_presets_empty: 'No custom presets defined yet.',
      btn_delete: 'Delete',

      // Options Page — Timetable
      opt_tt_title: 'Weekly Academic Timetable',
      opt_tt_desc: 'Map your weekly class schedule to designated campus coordinates. When browsing your university attendance portal during a scheduled class slot, the extension automatically activates the matching coordinates.',
      opt_tt_day: 'Day of Week',
      opt_day_mon: 'Monday (Senin)',
      opt_day_tue: 'Tuesday (Selasa)',
      opt_day_wed: 'Wednesday (Rabu)',
      opt_day_thu: 'Thursday (Kamis)',
      opt_day_fri: 'Friday (Jumat)',
      opt_day_sat: 'Saturday (Sabtu)',
      opt_day_sun: 'Sunday (Minggu)',
      opt_tt_start: 'Start Time',
      opt_tt_end: 'End Time',
      opt_tt_subject: 'Subject / Facility',
      opt_tt_subject_ph: 'e.g. Algoritma (TW1)',
      opt_tt_btn_add: 'Add Timetable Slot',
      opt_tt_scheduled: 'Scheduled Classes',
      opt_tt_empty: 'No timetable slots scheduled yet.',

      // Options Page — Backup & Restore
      opt_backup_title: 'Backup & Restore Configuration',
      opt_backup_desc: 'Export your full configuration (custom presets, timetable schedules, default coordinates, and settings) to a portable JSON file, or restore a previously saved backup.',
      opt_backup_export: 'Export Backup (JSON)',
      opt_backup_import: 'Import Backup',
      opt_backup_success: 'Configuration backup downloaded successfully.',
      opt_restore_success: 'Configuration imported successfully!',

      // Options Page — Management
      opt_mgmt_title: 'Common Management Options',
      opt_mgmt_desc: "You can manage this extension's core behavior natively through your browser's extension settings page.",
      opt_mgmt_power_title: 'On/Off Toggle',
      opt_mgmt_power_desc: 'You can completely disable the extension without deleting it. This instantly stops all location overriding and background processes.',
      opt_mgmt_incog_title: 'Allow in Incognito',
      opt_mgmt_incog_desc: 'By default, extensions cannot run in private browsing windows. If you use the attendance portal in Incognito mode, you must explicitly grant this permission in the extension settings.',
      opt_mgmt_access_title: 'Site Access',
      opt_mgmt_access_desc: 'Controls whether the extension can read and change data. Currently, it is heavily restricted to only operate on specific target URLs for maximum privacy and safety.',
      opt_mgmt_pin_title: 'Pin / Unpin',
      opt_mgmt_pin_desc: 'Click the puzzle icon in your browser toolbar to pin this extension. This allows you to quickly open the popup to drag the map and update coordinates.',
      opt_mgmt_remove_title: 'Remove',
      opt_mgmt_remove_desc: 'Completely uninstalls the extension and deletes all saved preferences and custom coordinates from your local storage.',
      opt_mgmt_link: 'Open Browser Extension Settings',

      // Options Page — Systems
      opt_sys_title: 'System Architecture & Explanation',
      opt_sys_lead: 'This extension operates by silently overriding the standard web APIs that websites use to ask for your physical location.',
      opt_sys_inject_title: '1. The Injection Bridge',
      opt_sys_inject_desc: "Modern browsers isolate extension scripts (ISOLATED world) from the website's scripts (MAIN world) for security. To successfully trick a website, this extension injects a tiny script directly into the MAIN world before the page even finishes loading (document_start). This script overwrites the native navigator.geolocation.getCurrentPosition and watchPosition functions.",
      opt_sys_drift_title: '2. Coordinate Spoofing & Drift',
      opt_sys_drift_desc: 'When the attendance portal asks for your location, the overridden function intercepts the request. Instead of asking your hardware GPS, it immediately responds with the exact Latitude and Longitude you selected in the popup. To make the spoof appear legitimate, it also applies a slight random "accuracy drift" (e.g. 15-25 meters) so the data resembles a real mobile phone GPS sensor.',
      opt_sys_comm_title: '3. Real-time Communication',
      opt_sys_comm_desc: 'The popup uses the chrome.storage API. When you drag the map pin in the popup, the new coordinates are saved instantly. A background service worker detects this change and broadcasts it directly to any open attendance tabs, allowing you to "walk" around the map without reloading the portal.',

      // Options Page — Risks & Policies
      opt_risks_title: 'Risks & Disclaimers',
      opt_risks_disclaimer_label: 'Disclaimer:',
      opt_risks_disclaimer_text: 'This extension is provided for educational, research, and privacy purposes. You are solely responsible for how you use it.',
      opt_risks_item1: '<strong>Academic Integrity:</strong> Spoofing your location to submit attendance when you are not physically present may violate university policies or academic integrity codes. Misuse can lead to severe disciplinary action.',
      opt_risks_item2: '<strong>IP Address Detection:</strong> This extension only overrides browser GPS coordinates (frontend). It does <strong>not</strong> change your IP address. If the server checks whether your IP address belongs to the campus network, they will know you are off-campus regardless of your GPS coordinates.',
      opt_risks_item3: '<strong>VPN Usage:</strong> To mitigate IP detection, you should use the official OpenVPN campus profile alongside this extension. However, be aware that system administrators can easily identify VPN IP pools.',
      opt_risks_item4: '<strong>Telemetry & Timing:</strong> Sophisticated anti-cheat systems can detect spoofing by measuring response times (real GPS takes a few seconds to lock on, whereas spoofed GPS responds instantly) or by looking for missing browser sensor telemetry.',

      // Options Page — Q&A
      opt_qna_title: 'Thorough Q&A',
      opt_qna_q1: "Q: I set my location, but the website still says I'm far away. Why?",
      opt_qna_a1: "A: The website might have cached your previous location, or it might be relying on your IP Address rather than GPS. Try hard-refreshing the page (Ctrl+F5). If that fails, ensure the extension toggle is strictly set to \"Active\" in the popup.",
      opt_qna_q2: 'Q: Do I need a VPN to use this?',
      opt_qna_a2: 'A: For frontend GPS bypass, no. However, if the attendance portal requires you to be connected to the campus Wi-Fi network to submit, you will need to use a VPN (like OpenVPN Connect with your campus profile) to route your traffic through the university servers.',
      opt_qna_q3: 'Q: Can the administrators detect this extension?',
      opt_qna_a3: 'A: Websites cannot natively see what extensions you have installed due to browser sandboxing. However, they can infer spoofing if your GPS coordinates perfectly match the center of a building with exactly 25.0 meters of accuracy, or if you jump 10 miles in 2 seconds. The extension tries to mitigate this by adding slight randomness.',
      opt_qna_q4: 'Q: Why did I get a timeout error when taking attendance?',
      opt_qna_a4: "A: Sometimes the portal's backend server is overloaded, or your VPN connection dropped packets. The extension answers the GPS request instantly, so timeouts are almost always an issue with your network or the target server, not the spoofer.",
      opt_qna_q5: 'Q: Does this work on my phone?',
      opt_qna_a5: 'A: Standard Chrome for Android/iOS does not support extensions. You would need a browser that supports mobile extensions (like Kiwi Browser or Firefox Nightly for Android), but results may vary heavily based on the OS-level location permissions.',

      // Options Page — Submission Log
      opt_log_title: 'Submission Log',
      opt_log_lead: 'Last 50 coordinate submissions recorded locally:',
      opt_badge_accepted: 'Accepted',
      opt_badge_rejected: 'Rejected',
      opt_badge_pending: 'Pending',
      opt_log_empty: 'No attendance submissions recorded yet.',
      opt_log_export_csv: 'Export CSV',
      opt_log_export_json: 'Export JSON',
      opt_log_clear: 'Clear Log',

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
      badge_optional: 'Opsional',
      badge_recommended: 'Disarankan',

      // Tabs
      tab_location: 'Lokasi & Preset',
      tab_telemetry: 'Telemetri & Alat',

      // Map & Coords
      map_preview: 'Pratinjau Peta',
      latitude: 'Garis Lintang (Lat)',
      longitude: 'Garis Bujur (Lng)',
      campus_presets: 'Preset Kampus (Kampus Utama)',
      custom_presets: 'Preset Khusus',
      preset_tower1_sub: 'Sains',
      preset_tower2_sub: 'Gedung T2',
      preset_koridc_sub: 'Kelas C',
      my_location: 'Gunakan Lokasi Asli Saat Ini',
      save_apply: 'Simpan & Terapkan Koordinat',

      // Telemetry & Diagnostic Ribbon
      engine_telemetry: 'Suite Siluman (Stealth)',
      stealth_max: 'Maksimum',
      active_profile: 'Pencocok Ruang Otomatis',
      auto_room_match: 'Aktif',
      device_profile: 'Profil Perangkat',
      prof_mobile: 'GPS Seluler (4-10m)',
      prof_desktop: 'Desktop / IP (20-40m)',
      prof_weak: 'Sinyal Lemah (50-120m)',
      velocity_limiter: 'Pembatas Kecepatan',
      vpn_guard: 'Pengaman VPN Kampus',
      device_mode: 'Mode Perangkat',
      diagnostic_section: 'Uji Diagnostik & Kebocoran',
      btn_browserleaks: 'Uji Browserleaks',
      btn_html5: 'Uji Demo HTML5',
      diag_gps_label: 'Hook GPS HTML5',
      diag_gps_active: 'AKTIF (Siap)',
      diag_ip_label: 'IP Jaringan / ISP',
      diag_ip_checking: 'Memeriksa IP...',
      diag_ip_campus_ok: 'Jaringan Kampus (OK)',
      diag_ip_external: 'Jaringan Eksternal',
      diag_last_submit: 'Presensi Terakhir',
      diag_test_mode_toggle: 'Mode Uji (Semua Situs)',
      diag_notice_bold: 'Catatan:',
      diag_notice_text: 'Ekstensi memodifikasi navigator.geolocation. Deteksi IP jaringan pada alat geolokasi eksternal memerlukan VPN Kampus.',
      diag_verify_title: 'Verifikasi Penimpaan GPS',

      // Swarm Peer Sync
      peer_sync_title: 'Daftar Kode Peer Swarm',
      peer_badge_mesh: 'Sinkron KV',
      peer_class_placeholder: 'Mata Kuliah / Kelas',
      peer_code_placeholder: '6 Digit Kode OTP',
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
      toast_campus_verified: 'Jaringan Kampus Terverifikasi',
      alert_vpn_required: 'Spoof dijeda: VPN Kampus diwajibkan oleh pengaturan.',
      alert_open_settings: 'Buka Pengaturan',

      // Options Page — Sidebar Navigation
      nav_preferences: 'Preferensi',
      nav_custom_presets: 'Preset Khusus',
      nav_timetable: 'Jadwal Kuliah',
      nav_backup_restore: 'Cadangkan & Pulihkan',
      nav_management: 'Manajemen',
      nav_log: 'Riwayat Presensi',
      nav_systems: 'Cara Kerja',
      nav_risks: 'Risiko & Kebijakan',
      nav_qna: 'Tanya Jawab',

      // Options Page — Preferences
      opt_header_title: 'Pengaturan & Dokumentasi',
      opt_header_sub: 'Dokumentasi & Konfigurasi Attendance Spoofer',
      opt_pref_title: 'Preferensi',
      opt_default_lat: 'Latitude Default',
      opt_default_lng: 'Longitude Default',
      opt_target_domain: 'Domain Target',
      opt_target_domain_desc: 'Spoofing hanya aktif saat membuka domain ini secara spesifik.',
      opt_relay_url: 'URL Relay Peer OTP',
      opt_relay_desc: 'Endpoint Cloudflare Worker. Bila diisi, kode OTP dan token dibagikan secara waktu nyata ke pengguna lain. Kosongkan jika tidak digunakan.',
      opt_language: 'Bahasa Tampilan',
      opt_theme: 'Preferensi Tema',
      opt_theme_system: 'Default Sistem',
      opt_theme_light: 'Mode Terang',
      opt_theme_dark: 'Mode Gelap',
      opt_vpn_lock_title: 'Kunci Jaringan Kampus / VPN',
      opt_vpn_lock_desc: 'Saat AKTIF, spoofing dicegah jika IP terdeteksi di luar jaringan kampus (Wi-Fi atau VPN). NONAKTIFKAN untuk mengizinkan presensi jarak jauh dari jaringan mana pun.',
      opt_vpn_warning_lead: 'Kunci Jaringan NONAKTIF.',
      opt_vpn_warning_text: 'Spoofing akan berjalan dari jaringan mana pun. Pastikan Anda terhubung ke VPN Kampus jika diwajibkan oleh portal, jika tidak portal mungkin tetap menolak karena pembatasan IP.',
      opt_test_mode_title: 'Mode Uji Diagnostik Global',
      opt_test_mode_desc: 'Saat diaktifkan, spoofing geolocation berlaku untuk semua situs web dan alat diagnostik (mis. BrowserLeaks, HTML5 Demos) untuk pengujian cepat.',
      opt_device_type: 'Tipe Emulasi Perangkat',
      opt_device_desktop: 'Desktop (Default)',
      opt_device_android: 'Android (Galaxy S23)',
      opt_device_ios: 'iOS (iPhone 15 Pro)',
      opt_device_desc: 'Mengganti User-Agent dan platform browser untuk meniru perangkat seluler di desktop.',
      opt_btn_save: 'Simpan Preferensi',
      opt_saved_status: 'Berhasil disimpan',

      // Options Page — Custom Presets
      opt_presets_title: 'Preset Fasilitas & Ruang Kampus Khusus',
      opt_presets_desc: 'Tentukan fasilitas kampus khusus, pusat riset, atau ruang kuliah departemen dengan koordinat GPS tertentu. Lokasi ini akan muncul di daftar pilihan cepat popup dan dicocokkan otomatis oleh detektor ruang presensi.',
      opt_preset_name: 'Nama Fasilitas / Ruang',
      opt_preset_name_ph: 'mis. Lab Robotika',
      opt_preset_regex: 'Regex Pencocokan (Opsional)',
      opt_preset_regex_ph: 'mis. ROBOTIK|ROBOT',
      opt_preset_lat: 'Garis Lintang (Lat)',
      opt_preset_lng: 'Garis Bujur (Lng)',
      opt_preset_btn_add: 'Tambah Preset Khusus',
      opt_presets_saved: 'Preset Tersimpan',
      opt_presets_empty: 'Belum ada preset khusus yang dibuat.',
      btn_delete: 'Hapus',

      // Options Page — Timetable
      opt_tt_title: 'Jadwal Kuliah Mingguan',
      opt_tt_desc: 'Petakan jadwal kuliah mingguan Anda ke koordinat GPS kampus. Saat membuka portal presensi pada jadwal kuliah yang aktif, ekstensi secara otomatis mengaktifkan koordinat yang sesuai.',
      opt_tt_day: 'Hari',
      opt_day_mon: 'Senin',
      opt_day_tue: 'Selasa',
      opt_day_wed: 'Rabu',
      opt_day_thu: 'Kamis',
      opt_day_fri: 'Jumat',
      opt_day_sat: 'Sabtu',
      opt_day_sun: 'Minggu',
      opt_tt_start: 'Waktu Mulai',
      opt_tt_end: 'Waktu Selesai',
      opt_tt_subject: 'Mata Kuliah / Ruang',
      opt_tt_subject_ph: 'mis. Algoritma (TW1)',
      opt_tt_btn_add: 'Tambah Jadwal Kuliah',
      opt_tt_scheduled: 'Jadwal Kuliah Terdaftar',
      opt_tt_empty: 'Belum ada jadwal kuliah yang terdaftar.',

      // Options Page — Backup & Restore
      opt_backup_title: 'Cadangkan & Pulihkan Konfigurasi',
      opt_backup_desc: 'Ekspor seluruh konfigurasi Anda (preset khusus, jadwal kuliah, koordinat default, dan preferensi) ke berkas JSON, atau pulihkan dari cadangan sebelumnya.',
      opt_backup_export: 'Ekspor Cadangan (JSON)',
      opt_backup_import: 'Impor Cadangan',
      opt_backup_success: 'Cadangan konfigurasi berhasil diunduh.',
      opt_restore_success: 'Konfigurasi berhasil dipulihkan!',

      // Options Page — Management
      opt_mgmt_title: 'Opsi Manajemen Ekstensi',
      opt_mgmt_desc: 'Anda dapat mengatur perilaku utama ekstensi ini melalui halaman pengelolaan ekstensi browser.',
      opt_mgmt_power_title: 'Sakelar Nyala/Mati',
      opt_mgmt_power_desc: 'Anda dapat menonaktifkan ekstensi tanpa menghapusnya. Ini akan segera menghentikan semua modifikasi lokasi dan proses latar belakang.',
      opt_mgmt_incog_title: 'Izinkan di Mode Samaran (Incognito)',
      opt_mgmt_incog_desc: 'Secara default, ekstensi tidak berjalan di jendela penyamaran. Jika Anda membuka portal presensi di mode Incognito, aktifkan izin ini di pengaturan ekstensi browser.',
      opt_mgmt_access_title: 'Akses Situs',
      opt_mgmt_access_desc: 'Mengatur izin akses ekstensi. Ekstensi dibatasi secara ketat hanya berjalan pada URL target demi keamanan dan privasi maksimal.',
      opt_mgmt_pin_title: 'Sematkan / Lepas Sematan',
      opt_mgmt_pin_desc: 'Klik ikon puzzle di bilah alat browser untuk menyematkan ekstensi ini agar mudah dibuka kapan saja untuk memilih lokasi.',
      opt_mgmt_remove_title: 'Hapus Ekstensi',
      opt_mgmt_remove_desc: 'Menghapus instalasi ekstensi dan membersihkan semua preferensi serta koordinat dari penyimpanan lokal.',
      opt_mgmt_link: 'Buka Pengaturan Ekstensi Browser',

      // Options Page — Systems
      opt_sys_title: 'Arsitektur Sistem & Cara Kerja',
      opt_sys_lead: 'Ekstensi ini bekerja dengan memodifikasi secara transparan API web standar yang digunakan situs untuk meminta lokasi fisik Anda.',
      opt_sys_inject_title: '1. Jembatan Injeksi (Injection Bridge)',
      opt_sys_inject_desc: 'Browser modern mengisolasi skrip ekstensi (ISOLATED world) dari skrip situs (MAIN world). Untuk bekerja efektif, ekstensi menyuntikkan skrip langsung ke MAIN world sebelum halaman selesai dimuat (document_start), menggantikan fungsi native navigator.geolocation.getCurrentPosition dan watchPosition.',
      opt_sys_drift_title: '2. Modifikasi Koordinat & Drift Sensor',
      opt_sys_drift_desc: 'Saat portal presensi meminta lokasi, fungsi modifikasi mencegat permintaan tersebut dan langsung memberikan koordinat yang dipilih di popup. Dilengkapi simulasi jitter acak realistis agar identik dengan sensor GPS ponsel asli.',
      opt_sys_comm_title: '3. Komunikasi Waktu Nyata',
      opt_sys_comm_desc: 'Popup menggunakan chrome.storage API. Ketika Anda menggeser pin peta di popup, koordinat baru langsung disimpan dan disiarkan ke tab presensi yang sedang terbuka tanpa perlu memuat ulang halaman.',

      // Options Page — Risks & Policies
      opt_risks_title: 'Risiko & Batasan Tanggung Jawab',
      opt_risks_disclaimer_label: 'Pernyataan Penyangkalan:',
      opt_risks_disclaimer_text: 'Ekstensi ini disediakan untuk tujuan edukasi, riset, dan privasi. Anda bertanggung jawab penuh atas penggunaan ekstensi ini.',
      opt_risks_item1: '<strong>Integritas Akademik:</strong> Melakukan presensi saat tidak hadir secara fisik dapat melanggar tata tertib dan etika akademik universitas serta berisiko sanksi disiplin.',
      opt_risks_item2: '<strong>Deteksi Alamat IP:</strong> Ekstensi ini hanya memodifikasi koordinat GPS browser. Ekstensi <strong>tidak</strong> mengubah alamat IP Anda. Jika server memeriksa subnet IP kampus, gunakan VPN resmi kampus.',
      opt_risks_item3: '<strong>Penggunaan VPN:</strong> Untuk mengatasi pembatasan IP, gunakan profil VPN kampus resmi bersamaan dengan ekstensi ini.',
      opt_risks_item4: '<strong>Telemetri & Waktu:</strong> Sistem anti-cheat canggih dapat mendeteksi manipulasi melalui waktu respons dan sensor perangkat keras. Fitur stealth ekstensi ini mensimulasikan latensi dan telemetri alami.',

      // Options Page — Q&A
      opt_qna_title: 'Tanya Jawab Lengkap (FAQ)',
      opt_qna_q1: 'T: Saya sudah mengatur lokasi, tetapi situs web masih menunjukkan saya berada jauh. Mengapa?',
      opt_qna_a1: 'J: Situs web mungkin menyimpan cache lokasi sebelumnya, atau memverifikasi alamat IP alih-alih GPS. Coba muat ulang halaman dengan bersih (Ctrl+F5) dan pastikan sakelar ekstensi menyala "Aktif".',
      opt_qna_q2: 'T: Apakah saya memerlukan VPN untuk menggunakan ini?',
      opt_qna_a2: 'J: Untuk manipulasi koordinat GPS, tidak wajib. Namun jika portal presensi mewajibkan koneksi Wi-Fi kampus, Anda perlu menyalakan VPN resmi kampus.',
      opt_qna_q3: 'T: Bisakah administrator mendeteksi ekstensi ini?',
      opt_qna_a3: 'J: Situs web tidak dapat mendeteksi ekstensi yang terpasang berkat isolasi browser. Namun mereka bisa curiga jika koordinat tidak pernah berfluktuasi atau berpindah terlalu cepat. Ekstensi ini menambahkan fluktuasi acak alami dan pembatas kecepatan untuk mencegah hal tersebut.',
      opt_qna_q4: 'T: Mengapa saya mendapatkan pesan galat waktu habis (timeout) saat presensi?',
      opt_qna_a4: 'J: Biasanya hal ini terjadi karena server portal sedang padat atau koneksi VPN mengalami gangguan paket data, bukan dari ekstensi.',
      opt_qna_q5: 'T: Apakah ekstensi ini bisa digunakan di ponsel/smartphone?',
      opt_qna_a5: 'J: Browser Chrome standar di Android/iOS tidak mendukung ekstensi. Anda memerlukan browser yang mendukung ekstensi seluler (seperti Kiwi Browser atau Firefox Android).',

      // Options Page — Submission Log
      opt_log_title: 'Riwayat Presensi',
      opt_log_lead: '50 pengiriman koordinat terakhir yang tercatat di perangkat:',
      opt_badge_accepted: 'Diterima',
      opt_badge_rejected: 'Ditolak',
      opt_badge_pending: 'Menunggu',
      opt_log_empty: 'Belum ada pengiriman presensi yang tercatat.',
      opt_log_export_csv: 'Ekspor CSV',
      opt_log_export_json: 'Ekspor JSON',
      opt_log_clear: 'Hapus Riwayat',

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

    // 1. Elements with data-i18n
    const elements = root.querySelectorAll('[data-i18n]');
    elements.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const translated = t(key);

      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = translated;
      } else if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
        el.value = translated;
      } else if (el.tagName === 'OPTION') {
        el.textContent = translated;
      } else if (el.children.length === 0) {
        el.textContent = translated;
      } else {
        const textSpan = el.querySelector('.i18n-text');
        if (textSpan) {
          textSpan.textContent = translated;
        } else {
          // Update the first non-empty text node
          let replaced = false;
          for (let i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) {
              el.childNodes[i].nodeValue = ' ' + translated.trim() + ' ';
              replaced = true;
              break;
            }
          }
          if (!replaced) {
            el.appendChild(document.createTextNode(' ' + translated));
          }
        }
      }
    });

    // 2. Placeholders
    const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });

    // 3. Titles / Tooltips
    const titles = root.querySelectorAll('[data-i18n-title]');
    titles.forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });

    // 4. ARIA labels
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
