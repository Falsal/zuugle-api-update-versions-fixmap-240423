FROM postgres:13.9
ENV POSTGRES_PASSWORD docker
ENV POSTGRES_DB zuugle_suchseite_dev
COPY database.sql /docker-entrypoint-initdb.d/