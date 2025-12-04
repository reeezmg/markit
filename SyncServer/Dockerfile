FROM osrm/osrm-backend:latest

# Copy your OSRM extracted files
COPY osrm-data /data

EXPOSE 5000

CMD ["osrm-routed", "--algorithm", "mld", "/data/southern-zone-251024.osrm", "-p", "5000"]
