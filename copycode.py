import os
import datetime
 
# --- Configuration ---
# Folder jahan se code copy karna hai ('.' ka matlab hai current folder)
ROOT_DIRECTORY = "."
 
# Output file ka naam
OUTPUT_FILENAME = "project_code.txt"
 
# Jin file types ko include karna hai
INCLUDE_EXTENSIONS = [
    '.jsx',
    '.txt',
    '.md',
    '.json',
    '.html',
    '.css',
    '.js',
    '.env',
    '.yml',
    '.yaml',
]
 
# Jin folders ko ignore karna hai
EXCLUDE_DIRECTORIES = [
    '__pycache__',
    '.git',
    '.vscode',
    'venv',
    'migrations',
    '.idea',
    'node_modules',
]
 
# Jin specific files ko ignore karna hai
EXCLUDE_FILES = [
    OUTPUT_FILENAME, # Khud output file ko include mat karo
]
# --- End of Configuration ---
 
def should_exclude(path, exclude_dirs, exclude_files):
    """Check if a file or directory should be excluded."""
    path_parts = path.split(os.sep)
   
    # Check against excluded directories
    for part in path_parts:
        if part in exclude_dirs:
            return True
           
    # Check against excluded files
    if os.path.basename(path) in exclude_files:
        return True
       
    return False
 
def main():
    """Main function to walk through the directory and write to the output file."""
    print(f"Starting to copy project code to '{OUTPUT_FILENAME}'...")
   
    with open(OUTPUT_FILENAME, 'w', encoding='utf-8') as outfile:
        # Write a header with the current date and time
        outfile.write(f"--- Project Codebase Dump ---\n")
        outfile.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write(f"Root Directory: {os.path.abspath(ROOT_DIRECTORY)}\n")
        outfile.write("=" * 80 + "\n\n")
 
        # Walk through the directory
        for dirpath, dirnames, filenames in os.walk(ROOT_DIRECTORY):
            # --- Exclude directories in-place ---
            # This is more efficient as it stops os.walk from entering them
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRECTORIES]
           
            for filename in filenames:
                # Check if the file has a valid extension
                if any(filename.endswith(ext) for ext in INCLUDE_EXTENSIONS):
                    file_path = os.path.join(dirpath, filename)
                   
                    # Check if the file should be excluded
                    if not should_exclude(file_path, EXCLUDE_DIRECTORIES, EXCLUDE_FILES):
                        relative_path = os.path.relpath(file_path, ROOT_DIRECTORY)
                        print(f"  + Added: {relative_path}")
                       
                        # Write the file path as a header
                        outfile.write("-" * 80 + "\n")
                        outfile.write(f"File: {relative_path}\n")
                        outfile.write("-" * 80 + "\n")
                       
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as infile:
                                outfile.write(infile.read())
                            outfile.write("\n\n")
                        except Exception as e:
                            outfile.write(f"!!! Could not read file: {e} !!!\n\n")
 
    print(f"\n🎉 Success! All code has been written to '{OUTPUT_FILENAME}'.")
 
if __name__ == "__main__":
    main()