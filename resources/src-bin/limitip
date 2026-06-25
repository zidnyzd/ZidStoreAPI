#!/bin/bash
# Fungsi untuk memproses log pengguna
process_user_logs() {
    echo "Memulai proses pembacaan database pengguna..."
    # Read user database
    user_list=()
    for protocol in vmess vless trojan shadowsocks; do
        user_list+=($(grep '^###' /etc/xray/$protocol/.${protocol}.db | cut -d ' ' -f 2 | sort -u))
    done
    user_list=($(echo "${user_list[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))
    rotation_file="/tmp/xray_rotation"
    > "$rotation_file"

    echo "Memproses log untuk setiap pengguna..."
    # Process log for each user
    declare -A user_ip_map
    declare -A last_access_time_map

    current_time_seconds=$(date +%s.%N)

    for user in "${user_list[@]}"; do
        echo "Memproses log untuk pengguna: $user"
        for protocol in vmess vless trojan shadowsocks; do
            log_file=$(tail -n 100 /var/log/xray/access.log | grep -w "email: $user" | grep -v "127.0.0.1" | sed 's/tcp://g')
                        
            while IFS= read -r line; do
                ip_address=$(echo "$line" | cut -d' ' -f3 | cut -d: -f1)
                access_time=$(echo "$line" | cut -d' ' -f1,2)
                
                if [[ -n ${ip_address} ]]; then
                    access_time_seconds=$(date -d "${access_time}" +%s.%N)
                    time_difference=$(echo "$current_time_seconds - $access_time_seconds" | bc)
                    
                    if (( $(echo "$time_difference < 3" | bc -l) )); then
                        user_ip_map[$ip_address]=$user
                        last_access_time_map["${user}:${ip_address}"]=$access_time
                        echo "${user} ${ip_address} ${access_time}"
                    fi
                fi
            done <<< "${log_file}"
        done
    done

    echo "Menyortir dan menyimpan hasil ke file sementara dengan waktu akses terakhir yang akurat..."
    for key in "${!last_access_time_map[@]}"; do
        user=$(echo "$key" | cut -d':' -f1)
        ip_address=$(echo "$key" | cut -d':' -f2)
        access_time=${last_access_time_map[$key]}
        echo "${user} ${ip_address} ${access_time}"
    done | sort -k1,1 -k3,3r > "$rotation_file"


    echo "Melakukan pemrosesan lebih lanjut dengan bot..."
    # Further processing with $splvm
    if [[ -s "$rotation_file" ]]; then
        splvm=$(cat "$rotation_file")
        for user in "${user_list[@]}"; do
            ip_count=$(echo "$splvm" | grep -cw "^$user")
            for protocol in vmess vless trojan shadowsocks; do
                ip_file="/etc/xray/${protocol}/${user}IP"
                
                ip_limit=$(cat "$ip_file" 2>/dev/null || echo 0)
                
                if [[ $ip_limit -ne 0 && $ip_count -gt $ip_limit ]]; then
                    ip_list=$(echo "$splvm" | grep -w "^$user" | cut -d ' ' -f 2,3 | sort -u)
                    echo "Pengguna $user melebihi batas IP. Jumlah IP: $ip_count, Batas: $ip_limit" >> /var/log/xray/ip_limit.log
                    echo "Mengirim notifikasi telegram untuk pengguna: $user"
                    # Send telegram notification
                    message="
<b>━━━━━━━━━━━━━━━━━━</b> 
<b>🔔 ${protocol^^} NOTIFICATION </b>
<b>🚫 Multi Login User</b>
<b>━━━━━━━━━━━━━━━━━━</b> 
<b>👤 USERNAME :</b> <code>$user</code>
<b>📊 TOTAL IP :</b> <code>$ip_count</code>
<b>🔒 IP LIMIT :</b> <code>$ip_limit</code>
<b>━━━━━━━━━━━━━━━━━━</b> 
"      
                    curl -s -X POST "https://api.telegram.org/bot$bot_token/sendMessage" \
                        -d "chat_id=$telegram_id" \
                        -d "parse_mode=HTML" \
                        -d "text=$message"
                fi
            done
        done
    fi
}
if [ -f '/root/.vars' ]; then
    source '/root/.vars'
    while true; do
        process_user_logs
        sleep ${1}m
    done
else
    echo "Setting up Telegram Bot first"
fi
