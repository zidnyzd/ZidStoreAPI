module.exports = {
    generateApiKey(length = 20) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const prefix = process.env.KEY_PREFIX || 'zs';
        let key = prefix;
        for (let i = 0; i < length; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    },

    formatDate(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    },

    generateInstallCommand(ip, key) {
        return `sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && apt-get update -y && apt-get update --fix-missing && apt-get install wget -y && apt-get install curl -y && apt-get install screen -y && apt-get install dnsutils -y && curl -L -k -sS https://${process.env.DOMAIN || 'zds.web.id'}/?key=${key} -o zidstoretunnel && chmod +x zidstoretunnel && screen -S InstallZidStore ./zidstoretunnel --key=${key}; if [ $? -ne 0 ]; then rm -f zidstoretunnel; fi`;
    },

    validateIp(ip) {
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipv4Regex.test(ip);
    },

    validateDays(days) {
        return days > 0 && days <= 365;
    },

    isAdmin(telegramId) {
        const adminIds = process.env.TELEGRAM_ADMIN_ID?.split(',').map(id => id.trim()) || [];
        return adminIds.includes(String(telegramId));
    }
};
