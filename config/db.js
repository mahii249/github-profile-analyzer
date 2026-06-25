const mysql = require('mysql2');
require('dotenv').config();

// Create the connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'github_analyzer',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Auto-migration support helper

// Promisify pool query to use async/await
const promisePool = pool.promise();

// Helper function to create the correct table structure
async function createNewTable(connection) {
  const query = `
    CREATE TABLE github_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(150),
      avatar_url VARCHAR(255),
      html_url VARCHAR(255),
      bio TEXT,
      company VARCHAR(150),
      location VARCHAR(150),
      public_repos INT DEFAULT 0,
      public_gists INT DEFAULT 0,
      followers INT DEFAULT 0,
      following INT DEFAULT 0,
      total_stars INT DEFAULT 0,
      total_forks INT DEFAULT 0,
      total_repo_size_kb INT DEFAULT 0,
      average_repo_size_kb DECIMAL(15, 2) DEFAULT 0.00,
      fork_ratio DECIMAL(15, 2) DEFAULT 0.00,
      star_ratio DECIMAL(15, 2) DEFAULT 0.00,
      top_languages JSON,
      most_starred_repo_name VARCHAR(255),
      most_starred_repo_stars INT DEFAULT 0,
      most_starred_repo_url VARCHAR(255),
      created_at_github DATETIME,
      analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;
  await connection.query(query);
}

// Test database connection and check/run automatic migrations
promisePool.getConnection()
  .then(async connection => {
    console.log('✅ Connected to MySQL database successfully!');
    
    try {
      // Verify if the table exists before attempting auto-migration
      const [tables] = await connection.query("SHOW TABLES LIKE 'github_profiles'");
      if (tables.length > 0) {
        const [columns] = await connection.query('SHOW COLUMNS FROM github_profiles');
        const columnNames = columns.map(c => c.Field.toLowerCase());
        
        // If the table is missing core columns of the original app (like avatar_url or total_stars),
        // it means it's an incompatible table from a different schema.
        if (!columnNames.includes('avatar_url') && !columnNames.includes('total_stars')) {
          const backupName = `github_profiles_old_${Date.now()}`;
          console.log(`⚠️ Existing 'github_profiles' table is incompatible. Renaming to '${backupName}' for backup...`);
          await connection.query(`RENAME TABLE github_profiles TO ${backupName}`);
          
          console.log(`🔧 Creating new 'github_profiles' table...`);
          await createNewTable(connection);
          console.log('✅ Successfully created github_profiles table.');
        } else {
          // Run column migrations for new metrics
          const migrations = [
            { name: 'total_repo_size_kb', type: 'INT DEFAULT 0 AFTER total_forks' },
            { name: 'average_repo_size_kb', type: 'DECIMAL(15, 2) DEFAULT 0.00 AFTER total_repo_size_kb' },
            { name: 'fork_ratio', type: 'DECIMAL(15, 2) DEFAULT 0.00 AFTER average_repo_size_kb' },
            { name: 'star_ratio', type: 'DECIMAL(15, 2) DEFAULT 0.00 AFTER fork_ratio' }
          ];

          for (const col of migrations) {
            if (!columnNames.includes(col.name.toLowerCase())) {
              console.log(`🔧 Auto-migration: Adding column '${col.name}' to github_profiles table...`);
              await connection.query(`ALTER TABLE github_profiles ADD COLUMN ${col.name} ${col.type}`);
            }
          }
        }
      } else {
        console.log(`🔧 Table 'github_profiles' does not exist. Creating it...`);
        await createNewTable(connection);
        console.log('✅ Successfully created github_profiles table.');
      }
    } catch (migrationErr) {
      console.warn('⚠️ Auto-migration check encountered an error:', migrationErr.message);
    }
    
    connection.release();
  })
  .catch(err => {
    console.error('❌ Failed to connect to MySQL database:', err.message);
    console.error('Verify your DB credentials in the .env file and ensure MySQL is running.');
  });

module.exports = promisePool;
