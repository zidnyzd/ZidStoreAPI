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
delete_user() {
    local protocol=$1
    local username=$2
    local db_file
    local config_file

    if [ "$protocol" == "ssh" ]; then
        db_file="/etc/ssh/.ssh.db"
    else
        db_file="/etc/xray/$protocol/.$protocol.db"
        config_file="/etc/xray/$protocol/config.json"
    fi
    
    # Baca daftar pengguna dari database
    local user_list=$(grep -E "^### " "$db_file" | cut -d ' ' -f 2)
    
    # Konversi daftar pengguna ke format JSON
    local json_users=$(echo "$user_list" | jq -R . | jq -s .)
    
    # Tampilkan daftar pengguna dalam format JSON
    echo "{\"users\": $json_users}"
    
    # Periksa apakah pengguna ada
    if ! echo "$user_list" | grep -q "^$username$"; then
        echo "{\"error\": \"Pengguna $username tidak ditemukan untuk protokol $protocol\"}"
        return 1
    fi
    
    # Dapatkan tanggal kedaluwarsa
    exp=$(grep -E "^### $username " "$db_file" | cut -d ' ' -f 3)
    
    # Hapus pengguna dari file konfigurasi dan database
    if [ "$protocol" == "ssh" ]; then
        userdel -f $username 2>/dev/null
        sed -i "/^### $username/d" /etc/ssh/.ssh.db
        rm -f /etc/xray/log-createssh-$username.log
    else
        sed -i "/^### $username $exp/,/^},{/d" "$config_file"
        sed -i "/^### $username $exp/d" "$db_file"
    fi
    
    # Hapus log jika ada
    if [ -f "/etc/xray/$protocol/log-create-${username}.log" ]; then
        rm -f "/etc/xray/$protocol/log-create-${username}.log"
    fi
    
    # Restart layanan
    if [ "$protocol" == "ssh" ]; then
        if ! systemctl restart sshd >/dev/null 2>&1; then
            echo "{\"warning\": \"Gagal merestart layanan $protocol. Silakan periksa log sistem untuk informasi lebih lanjut.\", \"status\": \"Akun telah berhasil dihapus dari database.\"}"
        else
            echo "{\"success\": \"Pengguna $username berhasil dihapus dari protokol $protocol\"}"
        fi
    else
        if ! systemctl restart $protocol@config >/dev/null 2>&1; then
            echo "{\"warning\": \"Gagal merestart layanan $protocol. Silakan periksa log sistem untuk informasi lebih lanjut.\", \"status\": \"Akun telah berhasil dihapus dari database.\"}"
        else
            echo "{\"success\": \"Pengguna $username berhasil dihapus dari protokol $protocol\"}"
        fi
    fi
}

# Endpoint API untuk menghapus pengguna
protocol=$1
username=$2

if [ -z "$username" ]; then
    case $protocol in
        vmess|vless|trojan|shadowsocks|ssh)
            # Tampilkan daftar pengguna dalam format JSON
            if [ "$protocol" == "ssh" ]; then
                db_file="/etc/ssh/.ssh.db"
            else
                db_file="/etc/xray/$protocol/.$protocol.db"
            fi
            user_list=$(grep -E "^### " "$db_file" | cut -d ' ' -f 2)
            json_users=$(echo "$user_list" | jq -R . | jq -s .)
            echo "{\"status\": \"success\", \"users\": $json_users, \"message\": \"Silakan masukkan username yang ingin dihapus\"}"
            ;;
        *)
            echo "{\"status\": \"error\", \"message\": \"Protokol tidak valid. Gunakan vmess, vless, trojan, shadowsocks, atau ssh.\"}"
            exit 1
            ;;
    esac
else
    result=$(delete_user $protocol $username)
    if [[ $result == *"\"success\""* ]]; then
        echo "{
        \"status\": \"success\",
        \"message\": \"Akun $protocol $username berhasil dihapus\",
        \"data\": {
            \"username\": \"$username\",
        }
    }"
    else
        echo "{
        \"status\": \"error\",
        \"message\": \"Akun $protocol $username tidak ditemukan\",
        \"data\": {
            \"username\": \"$username\",
        }
    }"
    fi
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
