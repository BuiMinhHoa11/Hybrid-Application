from .app_factory import create_app
from .routers import accounts, questions, papers, exams, results

app = create_app("public-api")
for routes in [accounts, questions, papers, exams, results]:
    app.include_router(routes.router)
