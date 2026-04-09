def create_app(*args, **kwargs):
    from .factory import create_app as _create_app

    return _create_app(*args, **kwargs)


app = create_app()


__all__ = ["app", "create_app"]
