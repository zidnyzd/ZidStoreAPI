#!/bin/bash

# Fetch URL from the first argument
data_acc="https://zds.web.id/api/exp?key="
data_key=$(cat /root/.key)

status_code=$(curl -s -o /dev/null -w "%{http_code}" $data_acc$data_key)

if [ $status_code -eq 200 ]; then
    expiry_date=$(date -d "$(curl -s $data_acc$data_key)" +%s)
    current_date=$(date +%s)
    remaining_days=$(( (expiry_date - current_date) / 86400 ))

    if [ $expiry_date -gt $current_date ]; then

# Receive parameters from command line
account_type="$1"
username="$2"
duration="$3"
quota="$4"
ip_limit="$5"

# Validasi input
validasi_input() {

    if ! [[ "$account_type" =~ ^(vmess|vless|trojan|shadowsocks|ssh)$ ]]; then
        echo '{"status": "error", "message": "Jenis akun tidak valid"}'
        exit 1
    fi

    # Periksa apakah pengguna ada dalam database
    if [ "$account_type" == "ssh" ]; then
        db_file="/etc/ssh/.ssh.db"
    else
        db_file="/etc/xray/$account_type/.$account_type.db"
    fi

    if ! grep -q "^### $username " "$db_file"; then
        echo '{"status": "error", "message": "Pengguna tidak ditemukan dalam database"}'
        exit 1
    fi
}

# Fungsi untuk memperbarui akun Vmess
perbarui_vmess() {
    # Baca tanggal kedaluwarsa dari database
    old_exp=$(grep -E "^### $username " "/etc/xray/vmess/.vmess.db" | cut -d ' ' -f 3)

    # Hitung sisa hari aktif
    days_left=$((($(date -d "$old_exp" +%s) - $(date +%s)) / 86400))
    if [[ $quota != "0" ]]; then
        quota_bytes=$((quota * 1024 * 1024 * 1024))
        echo "${quota_bytes}" >/etc/xray/vmess/${username}
        echo "${ip_limit}" >/etc/xray/vmess/${username}IP
    else
        rm -f /etc/xray/vmess/${username} /etc/xray/vmess/${username}IP
    fi

    # Hitung tanggal kedaluwarsa baru
    new_exp=$(date -d "$old_exp +${duration} days" +"%Y-%m-%d")
    uuid=$(grep -E "^### $username " "/etc/xray/vmess/.vmess.db" | cut -d ' ' -f 4)
    # Periksa apakah file konfigurasi ada sebelum membuat perubahan
    if [ ! -f "/etc/xray/vmess/config.json" ]; then
        echo "File konfigurasi tidak ditemukan. Membuat file baru..."
        echo '{"inbounds": []}' >/etc/xray/vmess/config.json
    fi

    sed -i "/^### $username/c\### $username $new_exp" /etc/xray/vmess/config.json
    sed -i "/^### $username/c\### $username $new_exp $uuid" /etc/xray/vmess/.vmess.db

    # Restart layanan dengan penanganan kesalahan
    if ! systemctl restart vmess@config >/dev/null 2>&1; then
        echo "Peringatan: Gagal merestart layanan vmess. Silakan periksa log sistem untuk informasi lebih lanjut."
        echo "Namun, akun telah berhasil diperbarui dalam database."
    fi

    echo "{
        \"status\": \"success\",
        \"message\": \"Akun Vmess $username berhasil diperbarui\",
        \"data\": {
            \"username\": \"$username\",
            \"exp\": \"$new_exp\",
            \"quota\": \"$quota\",
            \"limitip\": \"$ip_limit\"
        }
    }"
}

# Fungsi untuk memperbarui akun Vless
perbarui_vless() {
        # Baca tanggal kedaluwarsa dari database
    old_exp=$(grep -E "^### $username " "/etc/xray/vless/.vless.db" | cut -d ' ' -f 3)

    # Hitung sisa hari aktif
    days_left=$((($(date -d "$old_exp" +%s) - $(date +%s)) / 86400))
    if [[ $quota != "0" ]]; then
        quota_bytes=$((quota * 1024 * 1024 * 1024))
        echo "${quota_bytes}" >/etc/xray/vless/${username}
        echo "${ip_limit}" >/etc/xray/vless/${username}IP
    else
        rm -f /etc/xray/vless/${username} /etc/xray/vless/${username}IP
    fi

    # Hitung tanggal kedaluwarsa baru
    new_exp=$(date -d "$old_exp +${duration} days" +"%Y-%m-%d")
    uuid=$(grep -E "^### $username " "/etc/xray/vless/.vless.db" | cut -d ' ' -f 4)
    # Periksa apakah file konfigurasi ada sebelum membuat perubahan
    if [ ! -f "/etc/xray/vless/config.json" ]; then
        echo "File konfigurasi tidak ditemukan. Membuat file baru..."
        echo '{"inbounds": []}' >/etc/xray/vless/config.json
    fi

    sed -i "/^### $username/c\### $username $new_exp" /etc/xray/vless/config.json
    sed -i "/^### $username/c\### $username $new_exp $uuid" /etc/xray/vless/.vless.db

    # Restart layanan dengan penanganan kesalahan
    if ! systemctl restart vless@config >/dev/null 2>&1; then
        echo "Peringatan: Gagal merestart layanan vless. Silakan periksa log sistem untuk informasi lebih lanjut."
        echo "Namun, akun telah berhasil diperbarui dalam database."
    fi

    echo "{
        \"status\": \"success\",
        \"message\": \"Akun Vless $username berhasil diperbarui\",
        \"data\": {
            \"username\": \"$username\",
            \"exp\": \"$new_exp\",
            \"quota\": \"$quota\",
            \"limitip\": \"$ip_limit\"
        }
    }"
}

# Fungsi untuk memperbarui akun Trojan
perbarui_trojan() {
        # Baca tanggal kedaluwarsa dari database
    old_exp=$(grep -E "^### $username " "/etc/xray/trojan/.trojan.db" | cut -d ' ' -f 3)

    # Hitung sisa hari aktif
    days_left=$((($(date -d "$old_exp" +%s) - $(date +%s)) / 86400))
    if [[ $quota != "0" ]]; then
        quota_bytes=$((quota * 1024 * 1024 * 1024))
        echo "${quota_bytes}" >/etc/xray/trojan/${username}
        echo "${ip_limit}" >/etc/xray/trojan/${username}IP
    else
        rm -f /etc/xray/trojan/${username} /etc/xray/trojan/${username}IP
    fi

    # Hitung tanggal kedaluwarsa baru
    new_exp=$(date -d "$old_exp +${duration} days" +"%Y-%m-%d")
    uuid=$(grep -E "^### $username " "/etc/xray/trojan/.trojan.db" | cut -d ' ' -f 4)
    # Periksa apakah file konfigurasi ada sebelum membuat perubahan
    if [ ! -f "/etc/xray/trojan/config.json" ]; then
        echo "File konfigurasi tidak ditemukan. Membuat file baru..."
        echo '{"inbounds": []}' >/etc/xray/trojan/config.json
    fi

    sed -i "/^### $username/c\### $username $new_exp" /etc/xray/trojan/config.json
    sed -i "/^### $username/c\### $username $new_exp $uuid" /etc/xray/trojan/.trojan.db

    # Restart layanan dengan penanganan kesalahan
    if ! systemctl restart trojan@config >/dev/null 2>&1; then
        echo "Peringatan: Gagal merestart layanan trojan. Silakan periksa log sistem untuk informasi lebih lanjut."
        echo "Namun, akun telah berhasil diperbarui dalam database."
    fi

    echo "{
        \"status\": \"success\",
        \"message\": \"Akun Trojan $username berhasil diperbarui\",
        \"data\": {
            \"username\": \"$username\",
            \"exp\": \"$new_exp\",
            \"quota\": \"$quota\",
            \"limitip\": \"$ip_limit\"
        }
    }"
}

# Fungsi untuk memperbarui akun Shadowsocks
perbarui_shadowsocks() {
    # Baca tanggal kedaluwarsa dari database
    old_exp=$(grep -E "^### $username " "/etc/xray/shadowsocks/.shadowsocks.db" | cut -d ' ' -f 3)

    # Hitung sisa hari aktif
    days_left=$((($(date -d "$old_exp" +%s) - $(date +%s)) / 86400))
    if [[ $quota != "0" ]]; then
        quota_bytes=$((quota * 1024 * 1024 * 1024))
        echo "${quota_bytes}" >/etc/xray/shadowsocks/${username}
        echo "${ip_limit}" >/etc/xray/shadowsocks/${username}IP
    else
        rm -f /etc/xray/shadowsocks/${username} /etc/xray/shadowsocks/${username}IP
    fi

    # Hitung tanggal kedaluwarsa baru
    new_exp=$(date -d "$old_exp +${duration} days" +"%Y-%m-%d")
    uuid=$(grep -E "^### $username " "/etc/xray/shadowsocks/.shadowsocks.db" | cut -d ' ' -f 4)
    # Periksa apakah file konfigurasi ada sebelum membuat perubahan
    if [ ! -f "/etc/xray/shadowsocks/config.json" ]; then
        echo "File konfigurasi tidak ditemukan. Membuat file baru..."
        echo '{"inbounds": []}' >/etc/xray/shadowsocks/config.json
    fi

    sed -i "/^### $username/c\### $username $new_exp" /etc/xray/shadowsocks/config.json
    sed -i "/^### $username/c\### $username $new_exp $uuid" /etc/xray/shadowsocks/.shadowsocks.db

    # Restart layanan dengan penanganan kesalahan
    if ! systemctl restart shadowsocks@config >/dev/null 2>&1; then
        echo "Peringatan: Gagal merestart layanan shadowsocks. Silakan periksa log sistem untuk informasi lebih lanjut."
        echo "Namun, akun telah berhasil diperbarui dalam database."
    fi

    echo "{
        \"status\": \"success\",
        \"message\": \"Akun Shadowsocks $username berhasil diperbarui\",
        \"data\": {
            \"username\": \"$username\",
            \"exp\": \"$new_exp\",
            \"quota\": \"$quota\",
            \"limitip\": \"$ip_limit\"
        }
    }"
}
# Fungsi untuk memperbarui akun SSH
perbarui_ssh() {
    # Baca tanggal kedaluwarsa dari database
    old_exp=$(grep -E "^### $username " "/etc/ssh/.ssh.db" | cut -d ' ' -f 3)

    # Hitung sisa hari aktif
    days_left=$((($(date -d "$old_exp" +%s) - $(date +%s)) / 86400))
    echo "${quota}" >/etc/ssh/${username}

    # Hitung tanggal kedaluwarsa baru
    new_exp=$(date -d "$old_exp +${duration} days" +"%Y-%m-%d")

    sed -i "/^### $username/c\### $username $new_exp" /etc/ssh/.ssh.db

    # Perbarui tanggal kedaluwarsa pengguna
    chage -E "$new_exp" "$username"
    echo "{
        \"status\": \"success\",
        \"message\": \"Akun SSH $username berhasil diperbarui\",
        \"data\": {
            \"username\": \"$username\",
            \"exp\": \"$new_exp\",
            \"limitip\": \"$quota\"
        }
    }"
}

# Eksekusi utama
validasi_input

# Perbarui akun berdasarkan jenis
case "$account_type" in
    vmess)
        perbarui_vmess
        ;;
    vless)
        perbarui_vless
        ;;
    trojan)
        perbarui_trojan
        ;;
    shadowsocks)
        perbarui_shadowsocks
        ;;
    ssh)
        perbarui_ssh
        ;;
    *)
        echo '{"status": "error", "message": "Jenis akun tidak valid"}'
        exit 1
        ;;
esac


else
    echo '{
        "status": "error",
        "message": "PERMISSION DENIED!",
        "detail": "Your VPS $(wget -qO- ipv4.icanhazip.com) Has been Banned",
        "suggestion": "Buy access permissions for scripts",
        "contact": {
            "WhatsApp": "wa.me/6281584099035",
            "Telegram": "t.me/storezid2"
        }
    }'
    exit
fi
else
    echo '{
        "status": "error",
        "message": "PERMISSION DENIED!",
        "detail": "Your VPS $(wget -qO- ipv4.icanhazip.com) Has been Banned",
        "suggestion": "Buy access permissions for scripts",
        "contact": {
            "WhatsApp": "wa.me/6281584099035",
            "Telegram": "t.me/storezid2"
        }
    }'
    exit
fi
