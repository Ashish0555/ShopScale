from app.models import OrderState
from app.order_state import can_transition


def test_order_state_transitions_match_node_backend() -> None:
    assert can_transition(OrderState.PLACED, OrderState.CONFIRMED)
    assert can_transition(OrderState.CONFIRMED, OrderState.PACKED)
    assert can_transition(OrderState.PACKED, OrderState.SHIPPED)
    assert can_transition(OrderState.SHIPPED, OrderState.DELIVERED)
    assert not can_transition(OrderState.DELIVERED, OrderState.CANCELLED)
    assert not can_transition(OrderState.SHIPPED, OrderState.PLACED)
