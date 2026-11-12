import importlib
import sys

JOBS = {"regions": "jobs.regions", "regulated_areas": "jobs.regulated_areas", "loan_products_fss": "jobs.loan_products_fss",
        "transactions": "jobs.transactions", "complexes": "jobs.complexes", "geocode": "jobs.geocode", "pois": "jobs.pois"}


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in JOBS:
        sys.exit(f"usage: python main.py <{'|'.join(JOBS)}>")
    importlib.import_module(JOBS[sys.argv[1]]).run()


if __name__ == "__main__":
    main()
