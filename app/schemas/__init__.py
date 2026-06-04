raise ImportError(
    "app.schemas is deprecated. Schemas are now defined inside each module's controllers.py. "
    "Use app.auth.controllers, app.courses.controllers, etc. instead."
)
