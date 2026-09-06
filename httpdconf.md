# Auto generated apache config file by DirectAdmin version 1.662
# Modifying this file is not recommended as any changes you make will be
# overwritten when the user makes any changes to their website
# For global config changes that affect all Users, see this guide:
# http://help.directadmin.com/item.php?id=2
# For local config changes that only affect one User, see this guide:
# http://help.directadmin.com/item.php?id=3
<Directory "/home/admin/public_html">
		<FilesMatch "\.(inc|php|phtml|phps)$">
			AddHandler "proxy:unix:/usr/local/php81/sockets/admin.sock|fcgi://localhost" .inc .php .phtml
		</FilesMatch> 
		<FilesMatch "\.(php53|php54|php55|php56|php70|php71|php72|php73|php74|php80|php81|php82)$">
			Order Allow,Deny
			Deny from all
		</FilesMatch>
	<IfModule mod_fcgid.c>
		SuexecUserGroup admin admin
	</IfModule>
</Directory>
<VirtualHost 185.252.86.228:80 >
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:3011/
ProxyPassReverse / http://127.0.0.1:3011/
	ServerName www.omidcitylive.com
	ServerAlias www.omidcitylive.com omidcitylive.com
	ServerAdmin webmaster@omidcitylive.com
	DocumentRoot "/home/admin/domains/omidcitylive.com/public_html"
	UseCanonicalName OFF
	<IfModule !mod_ruid2.c>
		SuexecUserGroup admin admin
	</IfModule>
	CustomLog /var/log/httpd/domains/omidcitylive.com.bytes bytes
	CustomLog /var/log/httpd/domains/omidcitylive.com.log combined
	ErrorLog /var/log/httpd/domains/omidcitylive.com.error.log
	<Directory "/home/admin/domains/omidcitylive.com/public_html">
		AllowOverride AuthConfig FileInfo Indexes Limit Options=Indexes,IncludesNOEXEC,MultiViews,SymLinksIfOwnerMatch,FollowSymLinks,None
		Options -ExecCGI -Includes +IncludesNOEXEC
		<FilesMatch "\.(inc|php|phtml|phps|php)$">
			<If "-f %{REQUEST_FILENAME}">
				#ProxyErrorOverride on
				AddHandler "proxy:unix:/usr/local/php81/sockets/admin.sock|fcgi://localhost" .inc .php .phtml
			</If>
		</FilesMatch>
		<FilesMatch "\.(php53|php54|php55|php56|php70|php71|php72|php73|php74|php80|php81|php82)$">
			Order Allow,Deny
			Deny from all
		</FilesMatch>
	</Directory>
    # Mail auto configuration (Thunderbird)
    ProxyPassMatch "^/\.well-known/autoconfig/mail/config-v1\.1\.xml$" "unix:/usr/local/directadmin/shared/internal.sock|http://localhost"
</VirtualHost>
<VirtualHost 185.252.86.228:443 >
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:3011/
ProxyPassReverse / http://127.0.0.1:3011/
	SSLEngine on
	SSLCertificateFile /etc/httpd/conf/ssl.crt/server.crt.combined
	SSLCertificateKeyFile /etc/httpd/conf/ssl.key/server.key
	ServerName www.omidcitylive.com
	ServerAlias www.omidcitylive.com omidcitylive.com
	ServerAdmin webmaster@omidcitylive.com
	DocumentRoot "/home/admin/domains/omidcitylive.com/private_html"
	UseCanonicalName OFF
	<IfModule !mod_ruid2.c>
		SuexecUserGroup admin admin
	</IfModule>
	CustomLog /var/log/httpd/domains/omidcitylive.com.bytes bytes
	CustomLog /var/log/httpd/domains/omidcitylive.com.log combined
	ErrorLog /var/log/httpd/domains/omidcitylive.com.error.log
	<Directory "/home/admin/domains/omidcitylive.com/private_html">
		AllowOverride AuthConfig FileInfo Indexes Limit Options=Indexes,IncludesNOEXEC,MultiViews,SymLinksIfOwnerMatch,FollowSymLinks,None
		Options -ExecCGI -Includes +IncludesNOEXEC
		<FilesMatch "\.(inc|php|phtml|phps)$">
			<If "-f %{REQUEST_FILENAME}">
				#ProxyErrorOverride on
				AddHandler "proxy:unix:/usr/local/php81/sockets/admin.sock|fcgi://localhost" .inc .php .phtml
			</If>
		</FilesMatch> 
		<FilesMatch "\.(php53|php54|php55|php56|php70|php71|php72|php73|php74|php80|php81|php82)$">
			Order Allow,Deny
			Deny from all
		</FilesMatch>
	</Directory>
    # Mail auto configuration (Thunderbird)
    ProxyPassMatch "^/\.well-known/autoconfig/mail/config-v1\.1\.xml$" "unix:/usr/local/directadmin/shared/internal.sock|http://localhost"
</VirtualHost>
<VirtualHost 185.252.86.228:80 >
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:3011/
ProxyPassReverse / http://127.0.0.1:3011/
	ServerName www.car.omidcitylive.com
	ServerAlias www.car.omidcitylive.com car.omidcitylive.com
	ServerAdmin webmaster@omidcitylive.com
	DocumentRoot "/home/admin/domains/car.omidcitylive.com/public_html"
	UseCanonicalName OFF
	<IfModule !mod_ruid2.c>
		SuexecUserGroup admin admin
	</IfModule>
	CustomLog /var/log/httpd/domains/omidcitylive.com.car.bytes bytes
	CustomLog /var/log/httpd/domains/omidcitylive.com.car.log combined
	ErrorLog /var/log/httpd/domains/omidcitylive.com.car.error.log
	<Directory "/home/admin/domains/car.omidcitylive.com/public_html">
		AllowOverride AuthConfig FileInfo Indexes Limit Options=Indexes,IncludesNOEXEC,MultiViews,SymLinksIfOwnerMatch,FollowSymLinks,None
		Options -ExecCGI -Includes +IncludesNOEXEC
		<FilesMatch "\.(inc|php|phtml|phps)$">
			<If "-f %{REQUEST_FILENAME}">
				#ProxyErrorOverride on
				AddHandler "proxy:unix:/usr/local/php81/sockets/admin.sock|fcgi://localhost" .inc .php .phtml
			</If>
		</FilesMatch>
		<FilesMatch "\.(php53|php54|php55|php56|php70|php71|php72|php73|php74|php80|php81|php82)$">
			Order Allow,Deny
			Deny from all
		</FilesMatch>
	</Directory>
</VirtualHost>
<VirtualHost 185.252.86.228:443 >
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:3011/
ProxyPassReverse / http://127.0.0.1:3011/
	SSLEngine on
	SSLCertificateFile /etc/httpd/conf/ssl.crt/server.crt.combined
	SSLCertificateKeyFile /etc/httpd/conf/ssl.key/server.key
	ServerName www.car.omidcitylive.com
	ServerAlias www.car.omidcitylive.com car.omidcitylive.com
	ServerAdmin webmaster@omidcitylive.com
	DocumentRoot "/home/admin/domains/car.omidcitylive.com/public_html"
	UseCanonicalName OFF
	<IfModule !mod_ruid2.c>
		SuexecUserGroup admin admin
	</IfModule>
	CustomLog /var/log/httpd/domains/omidcitylive.com.car.bytes bytes
	CustomLog /var/log/httpd/domains/omidcitylive.com.car.log combined
	ErrorLog /var/log/httpd/domains/omidcitylive.com.car.error.log
	<Directory "/home/admin/domains/car.omidcitylive.com/public_html">
		AllowOverride AuthConfig FileInfo Indexes Limit Options=Indexes,IncludesNOEXEC,MultiViews,SymLinksIfOwnerMatch,FollowSymLinks,None
		Options -ExecCGI -Includes +IncludesNOEXEC
		<FilesMatch "\.(inc|php|phtml|phps)$">
			<If "-f %{REQUEST_FILENAME}">
				#ProxyErrorOverride on
				AddHandler "proxy:unix:/usr/local/php81/sockets/admin.sock|fcgi://localhost" .inc .php .phtml
			</If>
		</FilesMatch> 
		<FilesMatch "\.(php53|php54|php55|php56|php70|php71|php72|php73|php74|php80|php81|php82)$">
			Order Allow,Deny
			Deny from all
		</FilesMatch>
	</Directory>
</VirtualHost>
