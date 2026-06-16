# Use SQLite-Compatible Storage

Never Four stores sets in SQLite-compatible storage: local SQLite for development and Cloudflare D1 for deployment. A JSON file would be shorter, but SQLite gives atomic replacement and simple constraints for the three-item limit without adding a custom persistence layer.
