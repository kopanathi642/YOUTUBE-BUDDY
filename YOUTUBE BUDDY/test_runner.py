#!/usr/bin/env python
"""Quick-start testing script for YouTube Buddy."""
import subprocess
import sys
import os
from pathlib import Path

# Reconfigure stdout/stderr to avoid encoding crashes on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class TestRunner:
    """Manages test execution."""
    
    def __init__(self):
        self.backend_dir = Path(__file__).parent / "backend"
        self.failed = False
        self.python = f'"{sys.executable}"'
    
    def run_command(self, cmd, description):
        """Run a command and report results."""
        print(f"\n{'='*60}")
        print(f"🧪 {description}")
        print(f"{'='*60}")
        
        try:
            result = subprocess.run(cmd, cwd=str(self.backend_dir), shell=True)
            if result.returncode != 0:
                self.failed = True
                print(f"❌ {description} FAILED")
                return False
            print(f"✅ {description} PASSED")
            return True
        except Exception as e:
            print(f"❌ Error: {e}")
            self.failed = True
            return False
    
    def test_unit(self):
        """Run unit tests only."""
        self.run_command(
            f"{self.python} -m pytest tests/test_schemas.py tests/test_caption_utils.py tests/test_video_processing.py -v",
            "Unit Tests"
        )
    
    def test_integration(self):
        """Run integration tests."""
        self.run_command(
            f"{self.python} -m pytest tests/test_integration.py -v",
            "Integration Tests"
        )
    
    def test_celery(self):
        """Run Celery worker tests."""
        self.run_command(
            f"{self.python} -m pytest tests/test_celery_workers.py -v",
            "Celery Worker Tests"
        )
    
    def test_all(self):
        """Run all tests."""
        self.run_command(
            f"{self.python} -m pytest tests/ -v --tb=short",
            "All Tests (Complete Suite)"
        )
    
    def test_coverage(self):
        """Run tests with coverage report."""
        self.run_command(
            f"{self.python} -m pytest tests/ --cov=app --cov-report=html --cov-report=term",
            "Tests with Coverage Report"
        )
    
    def lint(self):
        """Run linter checks."""
        self.run_command(
            f"{self.python} -m ruff check app/",
            "Code Linting (Ruff)"
        )
    
    def validate_production(self):
        """Validate production setup."""
        self.run_command(
            f"{self.python} -m tests.production_validator validate",
            "Production Validator"
        )
    
    def generate_env_template(self):
        """Generate environment template."""
        print(f"\n{'='*60}")
        print(f"📋 Generating Environment Template")
        print(f"{'='*60}\n")
        
        try:
            result = subprocess.run(
                [sys.executable, "-m", "tests.production_validator", "env-template"],
                cwd=str(self.backend_dir),
                capture_output=True,
                text=True
            )
            print(result.stdout)
            
            # Save to file
            env_file = self.backend_dir / ".env.production.template"
            env_file.write_text(result.stdout)
            print(f"\n✅ Template saved to: {env_file}")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            self.failed = True
    
    def run_all(self):
        """Run full test suite."""
        print(f"\n{'#'*60}")
        print(f"# YOUTUBE BUDDY - PRODUCTION TEST SUITE")
        print(f"{'#'*60}")
        
        # Lint
        self.lint()
        
        # Unit tests
        self.test_unit()
        
        # Integration tests
        self.test_integration()
        
        # Celery tests
        self.test_celery()
        
        # Validation
        self.validate_production()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary."""
        print(f"\n{'#'*60}")
        if self.failed:
            print(f"# ❌ SOME TESTS FAILED")
            print(f"{'#'*60}")
            sys.exit(1)
        else:
            print(f"# ✅ ALL TESTS PASSED - READY FOR DEPLOYMENT")
            print(f"{'#'*60}")
            print(f"\nNext steps:")
            print(f"1. Review TEST_RESULTS.md for detailed report")
            print(f"2. Configure .env.production with real API keys")
            print(f"3. Set up PostgreSQL database")
            print(f"4. Run: gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app")
            print(f"5. Deploy to WordPress plugin directory")


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="YouTube Buddy Test Suite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_runner.py all           # Run complete test suite
  python test_runner.py unit          # Unit tests only
  python test_runner.py integration   # Integration tests only
  python test_runner.py lint          # Code linting
  python test_runner.py validate      # Production validation
  python test_runner.py coverage      # Tests with coverage report
  python test_runner.py env-template  # Generate .env template
        """
    )
    
    parser.add_argument(
        "command",
        nargs="?",
        default="all",
        choices=["all", "unit", "integration", "celery", "lint", "validate", "coverage", "env-template"],
        help="Test command to run"
    )
    
    args = parser.parse_args()
    
    runner = TestRunner()
    
    if args.command == "all":
        runner.run_all()
    elif args.command == "unit":
        runner.test_unit()
        runner.print_summary()
    elif args.command == "integration":
        runner.test_integration()
        runner.print_summary()
    elif args.command == "celery":
        runner.test_celery()
        runner.print_summary()
    elif args.command == "lint":
        runner.lint()
        runner.print_summary()
    elif args.command == "validate":
        runner.validate_production()
        runner.print_summary()
    elif args.command == "coverage":
        runner.test_coverage()
        runner.print_summary()
    elif args.command == "env-template":
        runner.generate_env_template()


if __name__ == "__main__":
    main()
