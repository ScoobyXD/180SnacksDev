"""
Appium Driver Manager
=====================
Handles creating and cleaning up Appium sessions.
This is the "glue" between your automation scripts and the Appium server.

Key concept: An Appium "session" is like opening a connection.
You create one, do your automation work, then close it.
If you don't close it, you'll leak resources.
"""

from appium import webdriver
from appium.options.common.base import AppiumOptions
from config.capabilities import APPIUM_SERVER_URL


class DriverManager:
    """
    Context manager for Appium sessions.
    
    Usage:
        with DriverManager(capabilities) as driver:
            driver.find_element(...)
            driver.click()
            # Session auto-closes when you exit the 'with' block
    """
    
    def __init__(self, capabilities: dict, server_url: str = APPIUM_SERVER_URL):
        self.capabilities = capabilities
        self.server_url = server_url
        self.driver = None
    
    def __enter__(self):
        """Start the Appium session."""
        print(f"[DriverManager] Connecting to Appium at {self.server_url}...")
        
        options = AppiumOptions()
        for key, value in self.capabilities.items():
            options.set_capability(key, value)
        
        self.driver = webdriver.Remote(
            command_executor=self.server_url,
            options=options,
        )
        
        # Set a reasonable implicit wait so element lookups don't fail instantly
        # if the UI is still loading. 10 seconds is a good default.
        self.driver.implicitly_wait(10)
        
        platform = self.capabilities.get("platformName", "unknown")
        automation = self.capabilities.get("appium:automationName", "unknown")
        print(f"[DriverManager] Session started — platform={platform}, automation={automation}")
        
        return self.driver
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Clean up the Appium session."""
        if self.driver:
            try:
                self.driver.quit()
                print("[DriverManager] Session closed cleanly.")
            except Exception as e:
                print(f"[DriverManager] Warning: error closing session: {e}")
        
        # Don't suppress exceptions — let them propagate
        return False


def create_driver(capabilities: dict, server_url: str = APPIUM_SERVER_URL):
    """
    Create an Appium driver without context manager.
    YOU are responsible for calling driver.quit() when done.
    
    Usage:
        driver = create_driver(capabilities)
        try:
            # ... do stuff ...
        finally:
            driver.quit()
    """
    options = AppiumOptions()
    for key, value in capabilities.items():
        options.set_capability(key, value)
    
    driver = webdriver.Remote(
        command_executor=server_url,
        options=options,
    )
    driver.implicitly_wait(10)
    return driver
