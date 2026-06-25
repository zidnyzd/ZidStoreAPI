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

        # color configuration
        green="\e[38;5;82m"
        red="\033[31m"
        normal='\033[0m'
        orange="\e[38;5;130m"
        bright_green="\e[92;1m"

        # Menentukan file log
        if [ -e "/var/log/auth.log" ]; then
            LOG_FILE="/var/log/auth.log"
        elif [ -e "/var/log/secure" ]; then
            LOG_FILE="/var/log/secure"
        else
            echo "File not exist"
            exit 1
        fi

        # Membuat file temporary
        touch /tmp/ssh_login_user

        clear

        # Fungsi untuk menampilkan informasi login SSH dan Dropbear
        tampilkan_info_ssh_dropbear() {

            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "${green}   .:::. SSH USER LOGIN ACCOUNTS .:::.${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"

            cat $LOG_FILE | grep -i sshd | grep -i "Accepted password for" >/tmp/login-db-ssh.txt
            cat $LOG_FILE | grep -i dropbear | grep -i "Password auth succeeded" >/tmp/login-db-dropbear.txt

            ssh_pids=($(pgrep sshd))
            dropbear_pids=($(pgrep dropbear))

            for ssh_pid in "${ssh_pids[@]}"; do
                if grep -q "sshd\[$ssh_pid\]" /tmp/login-db-ssh.txt; then
                    grep "sshd\[$ssh_pid\]" /tmp/login-db-ssh.txt >/tmp/login-db-pid-ssh.txt
                    ssh_num=$(wc -l </tmp/login-db-pid-ssh.txt)
                    ssh_user=$(grep -oP '(?<=for )\w+' /tmp/login-db-pid-ssh.txt)
                    ssh_ip=$(grep -oP '(?<=from )\d+\.\d+\.\d+\.\d+' /tmp/login-db-pid-ssh.txt)
                    echo "$ssh_pid $ssh_user $ssh_ip" >>/tmp/ssh_login_user
                fi
            done

            for dropbear_pid in "${dropbear_pids[@]}"; do
                if grep -q "dropbear\[$dropbear_pid\]" /tmp/login-db-dropbear.txt; then
                    grep "dropbear\[$dropbear_pid\]" /tmp/login-db-dropbear.txt >/tmp/login-db-pid-dropbear.txt
                    dropbear_num=$(wc -l </tmp/login-db-pid-dropbear.txt)
                    dropbear_user=$(grep -oP "(?<=for ')\w+(?=' from)" /tmp/login-db-pid-dropbear.txt | sed "s/'//g")
                    dropbear_ip=$(grep -oP '(?<=from )\d+\.\d+\.\d+\.\d+' /tmp/login-db-pid-dropbear.txt | cut -d ':' -f 1)
                    echo "$dropbear_pid $dropbear_user $dropbear_ip" >>/tmp/ssh_login_user
                fi
            done

            tampilkan_info_pengguna "/tmp/ssh_login_user"
        }

        tampilkan_info_pengguna() {
            local file=$1
            user_list=($(cat /etc/ssh/.ssh.db | grep '^###' | cut -d ' ' -f 2 | sort | uniq))

            if [[ -s $file ]]; then
                for user in ${user_list[@]}; do
                    user_count=$(cat $file | grep -w "${user}" | wc -l)
                    if [[ ${user_count} -gt 0 ]]; then
                        user_sessions=$(cat $file | grep -w "${user}" | cut -d ' ' -f 2 | wc -l)
                        if [[ ${user_sessions} -gt 0 ]]; then
                            if [[ -e /etc/ssh/${user} ]]; then
                                echo -e "${red} CONNECTION DETAILS:${normal}"
                                echo -e "${orange}┌───────────────────────────────────────┐${normal}"
                                echo -e "${orange}│${normal} USER: ${user}"
                                ip_limit=$(cat /etc/ssh/${user})
                                if [[ "$ip_limit" -eq 0 ]]; then
                                    echo -e "${orange}│${normal} IP LIMIT: Unlimited"
                                else
                                    echo -e "${orange}│${normal} IP LIMIT: $ip_limit"
                                fi
                                total_ip_connect=$(grep -cw "${user}" $file)
                                echo -e "${orange}│${normal} TOTAL IP CONNECT: $total_ip_connect"
                                echo -e "${orange}├───────────────────────────────────────┤${normal}"
                                echo -e "${orange}│ ${bright_green}IP LIST:${normal}"
                                i=1
                                user_ip_pid=$(cat $file | grep -w "${user}" | awk '{print $3, $1}' | sort -u)
                                while read -r line; do
                                    ip=$(echo $line | awk '{print $1}')
                                    pid=$(echo $line | awk '{print $2}')
                                    echo -e "${orange}│${normal}   $i. ${ip} » PID: ${pid}"
                                    ((i++))
                                done <<<"$user_ip_pid"
                                echo -e "${orange}└───────────────────────────────────────┘${normal}"
                                echo ""
                            fi
                        fi
                    fi
                done
            fi
        }

        # Menampilkan informasi
        tampilkan_info_ssh_dropbear

        # Membersihkan file temporary
        rm -rf /tmp/ssh_login_user /tmp/login-db-ssh.txt /tmp/login-db-dropbear.txt /tmp/login-db-pid-ssh.txt /tmp/login-db-pid-dropbear.txt
        echo " "
    else
        echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
        echo -e "\e[38;5;82m         ZIDSTORE AUTOSCRIPT          \033[0m"
        echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
        echo -e ""
        echo -e "            \033[31mPERMISSION DENIED !\033[0m"
        echo -e "   \033[0;33mYour VPS\033[0m $(wget -qO- ipv4.icanhazip.com) \033[0;33mHas been Banned\033[0m"
        echo -e "     \033[0;33mBuy access permissions for scripts\033[0m"
        echo -e "             \033[0;33mContact Admin :\033[0m"
        echo -e "      \033[0;32mWhatsApp\033[0m wa.me/6281584099035"
        echo -e "         \033[0;96mTelegram\033[0m t.me/storezid2"
        echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
        exit
    fi
else
    echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
    echo -e "\e[38;5;82m         ZIDSTORE AUTOSCRIPT          \033[0m"
    echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
    echo -e ""
    echo -e "            \033[31mPERMISSION DENIED !\033[0m"
    echo -e "   \033[0;33mYour VPS\033[0m $(wget -qO- ipv4.icanhazip.com) \033[0;33mHas been Banned\033[0m"
    echo -e "     \033[0;33mBuy access permissions for scripts\033[0m"
    echo -e "             \033[0;33mContact Admin :\033[0m"
    echo -e "      \033[0;32mWhatsApp\033[0m wa.me/6281584099035"
    echo -e "         \033[0;96mTelegram\033[0m t.me/storezid2"
    echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
    exit
fi
