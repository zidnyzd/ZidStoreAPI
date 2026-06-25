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

        # Bot Telegram
        source '/root/.vars'

        ipv4=$(wget -qO- ipv4.icanhazip.com 2>/dev/null || curl -s ipv4.icanhazip.com || echo "Unable to detect IP")

        # Colors
        green="\e[38;5;82m"
        red="\e[38;5;196m"
        neutral="\e[0m"
        orange="\e[38;5;130m"
        blue="\e[38;5;39m"
        yellow="\e[38;5;226m"
        purple="\e[38;5;141m"
        bold_white="\e[1;37m"
        reset="\e[0m"
        pink="\e[38;5;205m"

        # Function to print rainbow text
        print_rainbow() {
            local text="$1"
            local length=${#text}
            local start_color=(0 5 0)
            local mid_color=(0 200 0)
            local end_color=(0 5 0)

            for ((i = 0; i < length; i++)); do
                local progress=$(echo "scale=2; $i / ($length - 1)" | bc)

                if (($(echo "$progress < 0.5" | bc -l))); then
                    local factor=$(echo "scale=2; $progress * 2" | bc)
                    r=$(echo "scale=0; (${start_color[0]} * (1-$factor) + ${mid_color[0]} * $factor)/1" | bc)
                    g=$(echo "scale=0; (${start_color[1]} * (1-$factor) + ${mid_color[1]} * $factor)/1" | bc)
                    b=$(echo "scale=0; (${start_color[2]} * (1-$factor) + ${mid_color[2]} * $factor)/1" | bc)
                else
                    local factor=$(echo "scale=2; ($progress - 0.5) * 2" | bc)
                    r=$(echo "scale=0; (${mid_color[0]} * (1-$factor) + ${end_color[0]} * $factor)/1" | bc)
                    g=$(echo "scale=0; (${mid_color[1]} * (1-$factor) + ${end_color[1]} * $factor)/1" | bc)
                    b=$(echo "scale=0; (${mid_color[2]} * (1-$factor) + ${end_color[2]} * $factor)/1" | bc)
                fi

                printf "\e[38;2;%d;%d;%dm%s" "$r" "$g" "$b" "${text:$i:1}"
            done
            echo -e "$reset"
        }

        execute_backup() {
            backup_dir="/root/${ipv4}-$(date +%d%m%Y)"
            if [ -d "$backup_dir" ]; then
                rm -rf "$backup_dir"
            fi
            mkdir -p "$backup_dir"

            # Backup configuration files
            local files_to_backup=(
                "/etc/xray/vmess"
                "/etc/xray/vless"
                "/etc/xray/trojan"
                "/etc/xray/shadowsocks"
                "/etc/xray/*.log"
                "/etc/ssh"
                "/etc/passwd"
                "/etc/group"
                "/etc/shadow"
                "/etc/gshadow"
                "/etc/zidstore/banner"
            )

            for file in "${files_to_backup[@]}"; do
                cp -r $file "$backup_dir/" >/dev/null 2>&1 || { echo "Failed to backup $file"; }
            done

            # Compress backup directory
            tar -czf "${backup_dir}.tar.gz" -C "$(dirname "$backup_dir")" "$(basename "$backup_dir")" || { echo "Failed to compress backup"; }
            curl -s -F chat_id="$telegram_id" -F document=@"${backup_dir}.tar.gz" "https://api.telegram.org/bot$bot_token/sendDocument" >/dev/null 2>&1
            if [ -f "/var/www/html/${backup_dir}.tar.gz" ]; then
                rm -rf "/var/www/html/${backup_dir}.tar.gz"
            fi
            cp "${backup_dir}.tar.gz" /var/www/html/
            rm -rf "$backup_dir"
            rm -rf "${backup_dir}.tar.gz"
            echo "Backup completed"
            exit 0
        }

        execute_restore() {
            # Extract backup file
            if [ -d "/root/restore" ]; then
                rm -rf /root/restore
            fi
            mkdir -p /root/restore
            backup_dir="/root/restore/"
            tar -xzf /root/restore.tar.gz -C /root/restore || {
                echo "Failed to extract backup file"
                return 1
            }

            # Restore configuration files
            local files_to_restore=(
                "/root/restore/*/vmess"
                "/root/restore/*/vless"
                "/root/restore/*/trojan"
                "/root/restore/*/shadowsocks"
                "/root/restore/*/*.log"
            )
            local files_to_ssh=(
                "/root/restore/*/ssh"
                "/root/restore/*/ssh"
                "/root/restore/*/passwd"
                "/root/restore/*/group"
                "/root/restore/*/shadow"
                "/root/restore/*/gshadow"
                "/root/restore/*/banner"
            )
            for file in "${files_to_restore[@]}"; do
                cp -r $file /etc/xray/ >/dev/null 2>&1 || { echo "Failed to restore $file"; }
            done

            for filessh in "${files_to_ssh[@]}"; do
                cp -r $filessh /etc/ >/dev/null 2>&1 || { echo "Failed to restore $filessh"; }
            done

            # Remove temporary backup directory
            if [ -d "$backup_dir" ]; then
                rm -rf "$backup_dir" || {
                    echo "Failed to remove temporary backup directory"
                    return 1
                }
            else
                echo "Temporary backup directory does not exist, skipping removal"
            fi

            if [ -f /root/restore.tar.gz ]; then
                rm -rf /root/restore.tar.gz
            else
                echo "Backup file /root/restore.tar.gz does not exist, skipping removal"
            fi
            echo "Restore completed"
            exit 0
        }

        # Function to start server for backup/restore
        server_backup_restore() {
            clear
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "   ${green}.:::. BACKUP/RESTORE SERVER .:::.   ${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "       ${green}•${neutral} backup via web"
            echo -e "       ${green}•${neutral} restore via web"
            echo -e "       ${green}•${neutral} server backup restore"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo "Please Download/Restore files via web interface."
            echo "Server running at http://$ipv4:5000"
            node /usr/bin/backuprestore.js
            echo "  Process completed, web server stopped."
            echo "      Please restart the server"
            print_rainbow "─────────────────────────────────────────"
            echo -e ""
        }

        if [[ ${1} == "backup" ]]; then
            execute_backup
        elif [[ ${1} == "restore" ]]; then
            execute_restore
        elif [[ ${1} == "server" ]]; then
            server_backup_restore
        else
            echo "Invalid command. Use: backup, restore, server"
            exit 1
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
