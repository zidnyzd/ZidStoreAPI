#!/bin/bash

if [ -e "/var/log/auth.log" ]; then
    LOG_FILE="/var/log/auth.log"
elif [ -e "/var/log/secure" ]; then
    LOG_FILE="/var/log/secure"
else
    echo "File not exist"
    exit 1
fi

# Membuat file temporary
touch /tmp/ssh_log_limit

clear

# Fungsi untuk menampilkan informasi login SSH dan Dropbear
tampilkan_info_ssh_dropbear() {
    echo "Menampilkan proses log SSH dan Dropbear..."

    cat $LOG_FILE | grep -i sshd | grep -i "Accepted password for" >/tmp/login-db-ssh.txt
    cat $LOG_FILE | grep -i dropbear | grep -i "Password auth succeeded" >/tmp/login-db-dropbear.txt

    if [[ ! -s /tmp/login-db-ssh.txt && ! -s /tmp/login-db-dropbear.txt ]]; then
        echo "Tidak ada log SSH atau Dropbear yang ditemukan."
        return
    fi

    # Menggunakan pgrep untuk mendapatkan PID
    ssh_pids=($(pgrep sshd))
    dropbear_pids=($(pgrep dropbear))

    for ssh_pid in "${ssh_pids[@]}"; do
        if grep -q "sshd\[$ssh_pid\]" /tmp/login-db-ssh.txt; then
            grep "sshd\[$ssh_pid\]" /tmp/login-db-ssh.txt >/tmp/login-db-pid-ssh.txt
            ssh_num=$(wc -l </tmp/login-db-pid-ssh.txt)
            ssh_user=$(grep -oP '(?<=for )\w+' /tmp/login-db-pid-ssh.txt)
            ssh_ip=$(grep -oP '(?<=from )\d+\.\d+\.\d+\.\d+' /tmp/login-db-pid-ssh.txt)
            echo "SSH PID: $ssh_pid, User: $ssh_user, IP: $ssh_ip"
            echo "$ssh_pid $ssh_user $ssh_ip" >>/tmp/ssh_log_limit
        fi
    done

    for dropbear_pid in "${dropbear_pids[@]}"; do
        if grep -q "dropbear\[$dropbear_pid\]" /tmp/login-db-dropbear.txt; then
            grep "dropbear\[$dropbear_pid\]" /tmp/login-db-dropbear.txt >/tmp/login-db-pid-dropbear.txt
            dropbear_num=$(wc -l </tmp/login-db-pid-dropbear.txt)
            dropbear_user=$(grep -oP "(?<=for ')\w+(?=' from)" /tmp/login-db-pid-dropbear.txt | sed "s/'//g")
            dropbear_ip=$(grep -oP '(?<=from )\d+\.\d+\.\d+\.\d+' /tmp/login-db-pid-dropbear.txt | cut -d ':' -f 1)
            echo "Dropbear PID: $dropbear_pid, User: $dropbear_user, IP: $dropbear_ip"
            echo "$dropbear_pid $dropbear_user $dropbear_ip" >>/tmp/ssh_log_limit
        fi
    done

    tampilkan_info_pengguna "/tmp/ssh_log_limit"
}

tampilkan_info_pengguna() {
    user_list=($(cat /etc/ssh/.ssh.db | grep '^###' | cut -d ' ' -f 2 | sort | uniq))
    if [[ -s "$1" ]]; then
        splssh=$(cat "$1")
        for user in "${user_list[@]}"; do
            ip_count=$(cat "$1" | grep -cw "$user")
            ip_limit=$(cat "/etc/ssh/${user}" 2>/dev/null || echo 0)

            if [[ $ip_limit -ne 0 && $ip_count -gt $ip_limit ]]; then
                ip_list=$(cat "$1" | grep -w "$user" | cut -d ' ' -f 3 | sort -u)
                echo "User $user exceeds IP limit. IP count: $ip_count, Limit: $ip_limit"

                # Mengirim notifikasi ke Telegram
                message="
<b>━━━━━━━━━━━━━━━━━━</b> 
<b>🔔 SSH NOTIFICATION </b>
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
    fi
}

if [ -f '/root/.vars' ]; then
    source '/root/.vars'
    while true; do
        tampilkan_info_ssh_dropbear
        rm -f /tmp/ssh_log_limit
        sleep ${1}m  # Pastikan ${1} diatur ke nilai yang sesuai
    done
else
    echo "Setting up Telegram Bot first"
fi
