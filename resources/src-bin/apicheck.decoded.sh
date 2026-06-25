#!/bin/bash

# Fetch URL from the first argument
data_acc="https://zds.web.id/api/exp?key="
data_key=$(cat /root/.key)

status_code=$(curl -s -o /dev/null -w "%{http_code}" $data_acc$data_key)

if [ $status_code -eq 200 ]; then
    expiry_date=$(date -d "$(curl -s $data_acc$data_key)" +%s)
    current_date=$(date +%s)
    remaining_days=$(((expiry_date - current_date) / 86400))

    if [ $expiry_date -gt $current_date ]; then
        # function to convert bytes to a more readable format
        convert_size() {
            local -i size=$1
            if [[ $size -lt 1024 ]]; then
                echo "${size}B"
            elif [[ $size -lt 1048576 ]]; then
                echo "$(((size + 1023) / 1024))KB"
            elif [[ $size -lt 1073741824 ]]; then
                echo "$(((size + 1048575) / 1048576))MB"
            else
                echo "$(((size + 1073741823) / 1073741824))GB"
            fi
        }
        apissh() {
            if [ -e "/var/log/auth.log" ]; then
                log_file="/var/log/auth.log"
            elif [ -e "/var/log/secure" ]; then
                log_file="/var/log/secure"
            else
                echo "File tidak ada"
                exit 1
            fi

            cat $log_file | grep -i sshd | grep -i "Accepted password for" >/tmp/login-db-ssh.txt
            cat $log_file | grep -i dropbear | grep -i "Password auth succeeded" >/tmp/login-db-dropbear.txt

            ssh_pids=($(ps aux | grep "\[priv\]" | sort -k 72 | awk '{print $2}'))
            dropbear_pids=($(ps aux | grep -i dropbear | awk '{print $2}'))

            for ssh_pid in "${ssh_pids[@]}"; do
                if grep -q "sshd\[$ssh_pid\]" /tmp/login-db-ssh.txt; then
                    grep "sshd\[$ssh_pid\]" /tmp/login-db-ssh.txt >/tmp/login-db-pid-ssh.txt
                    ssh_count=$(wc -l </tmp/login-db-pid-ssh.txt)
                    ssh_user=$(grep -oP '(?<=for )\w+' /tmp/login-db-pid-ssh.txt)
                    ssh_ip=$(grep -oP '(?<=from )\d+\.\d+\.\d+\.\d+' /tmp/login-db-pid-ssh.txt)
                    echo "$ssh_pid $ssh_user $ssh_ip" >>/tmp/ssh_login_user
                fi
            done

            for dropbear_pid in "${dropbear_pids[@]}"; do
                if grep -q "dropbear\[$dropbear_pid\]" /tmp/login-db-dropbear.txt; then
                    grep "dropbear\[$dropbear_pid\]" /tmp/login-db-dropbear.txt >/tmp/login-db-pid-dropbear.txt
                    dropbear_count=$(wc -l </tmp/login-db-pid-dropbear.txt)
                    dropbear_user=$(grep -oP "(?<=for ')\w+(?=' from)" /tmp/login-db-pid-dropbear.txt | sed "s/'//g")
                    dropbear_ip=$(grep -oP '(?<=from )\d+\.\d+\.\d+\.\d+' /tmp/login-db-pid-dropbear.txt | cut -d ':' -f 1)
                    echo "$dropbear_pid $dropbear_user $dropbear_ip" >>/tmp/ssh_login_user
                fi
            done

            ssh_users=($(cat /etc/ssh/.ssh.db | grep '^###' | cut -d ' ' -f 2 | sort | uniq))

            if [[ -s /tmp/ssh_login_user ]]; then
                user_data=()
                for user in ${ssh_users[@]}; do
                    user_count=$(cat /tmp/ssh_login_user | grep -w "${user}" | wc -l)
                    if [[ ${user_count} -gt 0 ]]; then
                        user_ip_count=$(cat /tmp/ssh_login_user | grep -w "${user}" | cut -d ' ' -f 2 | wc -l)
                        if [[ ${user_ip_count} -gt 0 ]]; then
                            if [[ -e /etc/ssh/${user} ]]; then
                                ip_limit=$(cat /etc/ssh/${user})
                                if [[ "$ip_limit" -eq 0 ]]; then
                                    ip_limit="Unlimited"
                                fi
                                total_ip_connect=$(grep -cw "${user}" /tmp/ssh_login_user)
                                user_data+=("{
                                    \"user\": \"${user}\",
                                    \"ip_limit\": \"${ip_limit}\",
                                    \"total_ip_connect\": \"${total_ip_connect}\"
                        },")
                            fi
                        fi
                    fi
                done
                if [[ ${#user_data[@]} -gt 0 ]]; then
                    echo "{
            \"status\": \"success\",
            \"message\": \"ssh account successfully check\",
            \"data\":[${user_data[*]}]}"
                else
                    echo "{
            \"status\": \"success\",
            \"message\": \"No active connections at the moment.\",
            \"data\":[]}"
                fi
            fi
            rm -rf /tmp/ssh_login_user /tmp/login-db-ssh.txt /tmp/login-db-dropbear.txt /tmp/login-db-pid-ssh.txt /tmp/login-db-pid-dropbear.txt
        }

        # get data
        public_ip=$(curl -s ipv4.icanhazip.com)
        server_date=$(curl -s -I https://google.com | grep -i ^date | cut -d' ' -f2-)
        current_date=$(date +"%Y-%m-%d" -d "$server_date")
        current_time=$(date +%T)
        # function to check accounts
        apicheck() {
            local protocol=$1
            local log_file="/var/log/xray/access.log"

            # read user database
            users=($(grep '^###' /etc/xray/$protocol/.$protocol.db | cut -d ' ' -f 2 | sort -u))
            >/tmp/rotation_$protocol

            # process log for each user
            declare -A user_ips
            declare -A user_times
            declare -A user_log_counts

            for email in "${users[@]}"; do
                user_logs=$(tail -n 150 $log_file | grep -w "email: ${email}" | grep -v "127.0.0.1")
                current_timestamp=$(date +%s.%N)
                user_log_counts[$email]=$(grep -w "email: ${email}" $log_file | grep -v "127.0.0.1" | wc -l)

                while read -r log_entry; do
                    if [[ -n ${log_entry} ]]; then
                        ((user_log_counts[$email]++))
                        read -r _ log_time log_ip _ <<<"$log_entry"

                        if [[ $log_ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:([0-9]+))?$ ]]; then
                            log_ip=${log_ip%%:*}
                            log_timestamp=$(date -d "${log_time}" +%s.%N)
                            time_diff=$(echo "$current_timestamp - $log_timestamp" | bc)

                            if (($(echo "$time_diff < 10" | bc -l))); then
                                if [[ -n "${user_ips[$log_ip]}" && "${user_ips[$log_ip]}" != "$email" ]]; then
                                    continue
                                fi
                                user_ips[$log_ip]=$email
                                user_times["${email}:${log_ip}"]=$log_time
                            fi
                        fi
                    fi
                done <<<"${user_logs}"
            done

            # sort and save results to temporary file
            for log_ip in "${!user_ips[@]}"; do
                email="${user_ips[$log_ip]}"
                log_time="${user_times["${email}:${log_ip}"]}"
                echo "${email} ${log_ip} ${log_time}"
            done | sort -k1,1 -k3,3r >/tmp/rotation_$protocol

            # display results
            result="{
            \"status\": \"success\",
            \"message\": \"$protocol account successfully check\",
            \"data\":["
            if [[ -s /tmp/rotation_$protocol ]]; then
                last_user=""
                while read -r log_entry; do
                    read -r email log_ip log_time <<<"$log_entry"
                    if [[ -e /etc/xray/$protocol/${email} ]]; then
                        current_timestamp=$(date +%s.%N)
                        log_timestamp=$(date -d "${log_time}" +%s.%N)
                        time_diff=$(echo "$current_timestamp - $log_timestamp" | bc)

                        if (($(echo "$time_diff < 60" | bc -l))); then
                            if [[ "$email" != "$last_user" ]]; then
                                if [[ -n "$last_user" ]]; then
                                    result="${result%,}},"
                                fi
                                usage=$(</etc/xray/$protocol/usage/${email})
                                usage_size=$(convert_size ${usage})
                                quota=$(</etc/xray/$protocol/${email})
                                quota_size=$(convert_size ${quota})
                                ip_count=$(grep -cw "${email}" /tmp/rotation_$protocol)
                                ip_limit=$(cat /etc/xray/$protocol/${email}IP)
                                if [[ "$ip_limit" -eq 0 ]]; then
                                    ip_limit="Unlimited"
                                fi
                                result="${result}{
                            \"user\": \"${email}\",
                            \"usage\": \"${usage_size}\",
                            \"quota\": \"${quota_size}\",
                            \"ip_limit\": \"${ip_limit}\",
                            \"ip_count\": \"${ip_count}\",
                            \"log_count\": \"${user_log_counts[$email]}\"
                        },"
                            fi
                        fi
                    fi
                done </tmp/rotation_$protocol
                result="${result%,}]}"
            else
                result="{\"status\": \"success\", \"data\":[], \"message\": \"No active connections at the moment.\"}"
            fi

            echo -e "${result}"
        }

        case "$1" in
        "ssh")
            apissh "$@"
            ;;
        "vmess")
            apicheck "$1"
            ;;
        "vless")
            apicheck "$1"
            ;;
        "trojan")
            apicheck "$1"
            ;;
        "shadowsocks")
            apicheck "$1"
            ;;
        *)
            echo "Perintah tidak dikenal. Gunakan 'cek vmess' atau 'cek vless' atau 'cek trojan' atau 'cek shadowsocks'."
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
