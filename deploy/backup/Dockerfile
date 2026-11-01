# Backup image: pg_dump/pg_restore (same major version as the database), rclone for object
# storage and the off-server copy, openssl for encryption. Build context: deploy/backup.
FROM postgres:16-alpine
RUN apk add --no-cache rclone openssl tzdata
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh
ENV TZ=Africa/Casablanca
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["loop"]
