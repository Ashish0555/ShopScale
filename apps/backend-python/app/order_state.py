from app.models import OrderState


_ALLOWED: dict[OrderState, set[OrderState]] = {
    OrderState.PLACED: {OrderState.CONFIRMED, OrderState.CANCELLED},
    OrderState.CONFIRMED: {OrderState.PACKED, OrderState.CANCELLED},
    OrderState.PACKED: {OrderState.SHIPPED},
    OrderState.SHIPPED: {OrderState.DELIVERED},
    OrderState.DELIVERED: set(),
    OrderState.CANCELLED: set(),
}


def can_transition(current: OrderState, next_state: OrderState) -> bool:
    return next_state in _ALLOWED[current]
