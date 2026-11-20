import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import getpass

import bcrypt

from app.db_models import UserDB
from app.mysql_db import SessionLocal


def main():
    print()
    print("============================================")
    print(" Faculty Performance Evaluation")
    print(" Initial Administrator Account")
    print("============================================")
    print()

    db = SessionLocal()

    try:
        admin_exists = (
            db.query(UserDB)
            .filter(UserDB.role.in_(["hod", "principal"]))
            .first()
        )

        if admin_exists:
            print("An administrator account already exists.")
            print("Skipping initial administrator setup.")
            return

        role = input("Role (hod/principal): ").strip().lower()

        if role not in {"hod", "principal"}:
            print("ERROR: Role must be 'hod' or 'principal'.")
            raise SystemExit(1)

        email = input("Email / username: ").strip()
        name = input("Name: ").strip()
        college = input("College name: ").strip()
        department = input("Department: ").strip()

        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")

        if not password:
            print("ERROR: Password cannot be empty.")
            raise SystemExit(1)

        if len(password) < 8:
            print("ERROR: Password must be at least 8 characters.")
            raise SystemExit(1)

        if password != confirm:
            print("ERROR: Passwords do not match.")
            raise SystemExit(1)

        existing = db.query(UserDB).filter(UserDB.username == email).first()

        if existing:
            print("ERROR: A user with that email / username already exists.")
            raise SystemExit(1)

        password_hash = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt()
        ).decode("utf-8")

        user = UserDB(
            username=email,
            password_hash=password_hash,
            role=role,
            college_name=college,
            department=department,
        )

        db.add(user)
        db.commit()

        print()
        print("Administrator account created successfully.")
        print(f"Role: {role}")
        print(f"Username: {email}")
        print()

    except SystemExit:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        print(f"ERROR: Could not create administrator account: {exc}")
        raise SystemExit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()