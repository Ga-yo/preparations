import importlib
import sys

JOBS = {"regions": "jobs.regions", "loan_products_fss": "jobs.loan_products_fss"}


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in JOBS:
        sys.exit(f"usage: python main.py <{'|'.join(JOBS)}>")
    importlib.import_module(JOBS[sys.argv[1]]).run()


if __name__ == "__main__":
    main()
