import psycopg2
import json
from passlib.context import CryptContext
import bcrypt
# Configuration for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str):
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

# --- UPDATE THESE TO MATCH YOUR PGADMIN SETTINGS ---
DB_CONFIG = {
    "dbname": "Performance",
    "user": "postgres",
    "password": "password", # <--- Put your password here
    "host": "localhost",
    "port": "5432"
}

def seed_data():
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        print("Connected to PostgreSQL. Creating tables...")

        # 1. Create Tables
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL,
                college TEXT NOT NULL,
                department TEXT
            );
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS faculty_profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                employee_id TEXT UNIQUE,
                orcid TEXT,
                phone TEXT
            );
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS evaluations (
                id SERIAL PRIMARY KEY,
                faculty_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                academic_year TEXT,
                status TEXT,
                modules_data JSONB,
                total_points NUMERIC,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ''')

        # 2. Clear existing data
        cursor.execute("TRUNCATE evaluations, faculty_profiles, users RESTART IDENTITY CASCADE;")

        # 3. Seed Users
        demo_password = get_password_hash("demo123")
        users = [
            ("hod@demo.com", demo_password, "Dr. Sarah Smith", "HOD", "Engineering College", "CSE"),
            ("faculty@demo.com", demo_password, "Prof. Harsh Vishnu", "Faculty", "Engineering College", "CSE"),
            ("principal@demo.com", demo_password, "Dr. James Miller", "Principal", "Engineering College", None)
        ]
        
        for user in users:
            cursor.execute(
                "INSERT INTO users (email, hashed_password, full_name, role, college, department) VALUES (%s, %s, %s, %s, %s, %s)",
                user
            )

        # 4. Seed Faculty Profile
        cursor.execute("SELECT id FROM users WHERE email='faculty@demo.com'")
        faculty_user_id = cursor.fetchone()[0]
        
        cursor.execute('''
            INSERT INTO faculty_profiles (user_id, employee_id, orcid, phone) 
            VALUES (%s, 'EMP12345', '0000-0001-2345-6789', '+91 9876543210')
        ''', (faculty_user_id,))

        # 5. Seed Evaluation
        modules_data = {
            "student_feedback": {"percentage": 85, "points": 10},
            "conferences": {"count": 2, "points": 8},
            "ipr": {"patents": 1, "points": 15},
            "funded_projects": {"count": 1, "amount": 500000, "points": 20}
        }

        cursor.execute('''
            INSERT INTO evaluations (faculty_id, academic_year, status, modules_data, total_points) 
            VALUES (%s, '2024-25', 'SUBMITTED', %s, 124.0)
        ''', (faculty_user_id, json.dumps(modules_data)))

        conn.commit()
        cursor.close()
        conn.close()
        print("Successfully seeded PostgreSQL database!")
        print("Logins: hod@demo.com / faculty@demo.com | Pass: demo123")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    seed_data()