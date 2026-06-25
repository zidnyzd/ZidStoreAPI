#!/bin/bash

# Buat direktori jika belum ada
directories=(
    "/etc/xray/vmess/usage"
    "/etc/xray/vless/usage"
    "/etc/xray/trojan/usage"
    "/etc/xray/shadowsocks/usage"
)

for dir in "${directories[@]}"; do
    if [[ ! -d $dir ]]; then
        mkdir -p "$dir"
    fi
done
convert_size() {
    local -i bytes=$1
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt 1048576 ]]; then
        echo "$(((bytes + 1023) / 1024))KB"
    elif [[ $bytes -lt 1073741824 ]]; then
        echo "$(((bytes + 1048575) / 1048576))MB"
    else
        echo "$(((bytes + 1073741823) / 1073741824))GB"
    fi
}

# Fungsi untuk memproses pengguna
process_users() {
    local protocol=$1
    local config_file="/etc/xray/${protocol}/config.json"
    local usage_dir="/etc/xray/${protocol}/usage"
    local api_port=$2
    local db_file="/etc/xray/${protocol}/.${protocol}.db"

    local users=($(grep '^###' $config_file | cut -d ' ' -f 2 | sort | uniq))

    for user in "${users[@]}"; do
        xray api stats --server=127.0.0.1:${api_port} -name "user>>>${user}>>>traffic>>>downlink" >& /tmp/${user}
        downlink=$(awk '{print $1}' /tmp/${user})

        if [[ ${downlink} != "failed" ]]; then
            downlink_value=$(xray api stats --server=127.0.0.1:${api_port} -name "user>>>${user}>>>traffic>>>downlink" | grep -w "value" | awk '{print $2}' | cut -d '"' -f2)

            if [[ -e /etc/xray/${protocol}/usage/${user} ]]; then
                current_usage=$(cat /etc/xray/${protocol}/usage/${user})
                if [[ ${#current_usage} -gt 0 ]]; then
                    new_usage=$((downlink_value + current_usage))
                    echo "${new_usage}" > /etc/xray/${protocol}/usage/${user}
                else
                    echo "${downlink_value}" > /etc/xray/${protocol}/usage/${user}    
                fi
            else
                echo "${downlink_value}" > /etc/xray/${protocol}/usage/${user}
            fi

            xray api stats --server=127.0.0.1:${api_port} -name "user>>>${user}>>>traffic>>>downlink" -reset > /dev/null 2>&1
        else
            echo "Gagal mendapatkan statistik untuk user ${user}."
        fi
    done

    for user in "${users[@]}"; do
        if [[ -e /etc/xray/${protocol}/${user} ]]; then
            limit=$(cat /etc/xray/${protocol}/${user})
            if [[ ${#limit} -gt 1 ]]; then
                usage=$(cat ${usage_dir}/${user})
                if [[ ${usage} -gt ${limit} ]]; then
                    readable_usage=$(convert_size ${usage})
                    readable_limit=$(convert_size ${limit})
                    exp=$(grep -w "^### $user" $config_file | cut -d ' ' -f 3 | sort | uniq)
                    sed -i "/^### $user $exp/,/^},{/d" $config_file
                    sed -i "/^### $user $exp/d" $db_file
                    message="
<b>━━━━━━━━━━━━━━━━━━</b> 
<b>🔔 ${protocol^^} NOTIFICATION </b>
<b>🚫 Penggunaan Kuota</b>
<b>━━━━━━━━━━━━━━━━━━</b> 
<b>👤 USERNAME :</b> <code>$user</code>
<b>📊 TOTAL PENGGUNAAN :</b> <code>$readable_usage</code>
<b>🔒 BATAS PENGGUNAAN :</b> <code>$readable_limit</code>
<b>━━━━━━━━━━━━━━━━━━</b> 
"      
                    if [ -f '/root/.vars' ]; then
                        source '/root/.vars'
                        curl -s -X POST "https://api.telegram.org/bot$bot_token/sendMessage" \
                            -d "chat_id=$telegram_id" \
                            -d "parse_mode=HTML" \
                            -d "text=$message"
                    else
                        echo "Setting up Telegram Bot first"
                    fi

                    if [[ -f "/etc/xray/${protocol}/log-create-${user}.log" ]]; then
                        rm -f "/etc/xray/${protocol}/log-create-${user}.log"
                    fi

                    if ! systemctl restart ${protocol}@config >/dev/null 2>&1; then
                        echo "Peringatan: Gagal merestart layanan ${protocol}. Silakan periksa log sistem untuk informasi lebih lanjut."
                        echo "Namun, akun telah berhasil dihapus dari database."
                    fi
                else
                    echo "Penggunaan untuk user $user masih dalam batas."
                fi
            else
                echo "Batas penggunaan untuk user $user tidak ditemukan."
            fi
        else
            echo "File untuk user $user tidak ditemukan."
        fi
    done
}

while true; do
    sleep 30

    # Panggil fungsi untuk memproses pengguna vmess
    process_users "vmess" 20001

    # Panggil fungsi untuk memproses pengguna vless
    process_users "vless" 20002

    # Panggil fungsi untuk memproses pengguna trojan
    process_users "trojan" 20003

    # Panggil fungsi untuk memproses pengguna shadowsocks
    process_users "shadowsocks" 20004
done
